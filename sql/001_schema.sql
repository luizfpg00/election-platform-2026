-- ============================================================
-- EleiçãoPlan 2026 — Database Schema
-- ============================================================

-- Candidates table (synced from TSE data)
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_urna TEXT NOT NULL,
  cpf TEXT,
  numero INTEGER NOT NULL,
  partido TEXT NOT NULL,
  cargo TEXT NOT NULL, -- presidente, governador, senador, deputado_federal, deputado_estadual, prefeito, vereador
  uf TEXT,
  municipio TEXT,
  foto_url TEXT,
  ano_eleicao INTEGER NOT NULL,
  situacao TEXT, -- eleito, não eleito, suplente, etc.
  tse_id TEXT, -- ID original do TSE
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_candidates_nome ON candidates USING gin(to_tsvector('portuguese', nome));
CREATE INDEX idx_candidates_nome_urna ON candidates USING gin(to_tsvector('portuguese', nome_urna));
CREATE INDEX idx_candidates_cargo ON candidates(cargo);
CREATE INDEX idx_candidates_uf ON candidates(uf);
CREATE INDEX idx_candidates_ano ON candidates(ano_eleicao);
CREATE INDEX idx_candidates_partido ON candidates(partido);

-- Raw voting results (per section/zone)
CREATE TABLE IF NOT EXISTS voting_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  ano_eleicao INTEGER NOT NULL,
  uf TEXT NOT NULL,
  municipio TEXT NOT NULL,
  cod_municipio TEXT,
  zona TEXT,
  secao TEXT,
  local_votacao TEXT,
  votos INTEGER NOT NULL DEFAULT 0,
  votos_validos_total INTEGER DEFAULT 0,
  percentual NUMERIC(5,2) DEFAULT 0,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_voting_candidate ON voting_results(candidate_id);
CREATE INDEX idx_voting_uf ON voting_results(uf);
CREATE INDEX idx_voting_municipio ON voting_results(municipio);
CREATE INDEX idx_voting_ano ON voting_results(ano_eleicao);

-- Materialized view: votes by state
CREATE MATERIALIZED VIEW IF NOT EXISTS voting_results_by_state AS
SELECT
  candidate_id,
  uf,
  SUM(votos) AS total_votos,
  AVG(percentual) AS percentual_medio,
  COUNT(DISTINCT secao) AS total_secoes,
  MAX(votos) AS melhor_secao_votos,
  MIN(votos) AS pior_secao_votos
FROM voting_results
GROUP BY candidate_id, uf;

CREATE UNIQUE INDEX idx_vr_state_candidate_uf ON voting_results_by_state(candidate_id, uf);

-- Materialized view: votes by city
CREATE MATERIALIZED VIEW IF NOT EXISTS voting_results_by_city AS
SELECT
  candidate_id,
  uf,
  municipio,
  SUM(votos) AS total_votos,
  AVG(percentual) AS percentual_medio,
  COUNT(DISTINCT secao) AS total_secoes,
  MAX(votos) AS melhor_secao_votos,
  MIN(votos) AS pior_secao_votos
FROM voting_results
GROUP BY candidate_id, uf, municipio;

CREATE UNIQUE INDEX idx_vr_city_candidate_mun ON voting_results_by_city(candidate_id, uf, municipio);

-- Campaign plans (AI-generated)
CREATE TABLE IF NOT EXISTS campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cargo TEXT NOT NULL,
  content TEXT NOT NULL,
  estrategia_geografica TEXT,
  estimativa_custo TEXT,
  engajamento TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plans_candidate ON campaign_plans(candidate_id);
CREATE INDEX idx_plans_user ON campaign_plans(user_id);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_plans ENABLE ROW LEVEL SECURITY;

-- Candidates: readable by all authenticated users
CREATE POLICY "candidates_select" ON candidates
  FOR SELECT TO authenticated USING (true);

-- Voting results: readable by all authenticated users
CREATE POLICY "voting_results_select" ON voting_results
  FOR SELECT TO authenticated USING (true);

-- Campaign plans: users can only see/manage their own
CREATE POLICY "plans_select" ON campaign_plans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "plans_insert" ON campaign_plans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_delete" ON campaign_plans
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Grant access to materialized views
GRANT SELECT ON voting_results_by_state TO authenticated;
GRANT SELECT ON voting_results_by_city TO authenticated;

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_voting_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY voting_results_by_state;
  REFRESH MATERIALIZED VIEW CONCURRENTLY voting_results_by_city;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
