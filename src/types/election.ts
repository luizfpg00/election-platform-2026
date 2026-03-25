export interface Candidate {
  id: string;
  nome: string;
  nome_urna: string;
  cpf?: string;
  numero: number;
  partido: string;
  cargo: CargoType;
  uf?: string;
  municipio?: string;
  foto_url?: string;
  ano_eleicao: number;
  situacao?: string;
  created_at?: string;
}

export type CargoType =
  | 'presidente'
  | 'governador'
  | 'senador'
  | 'deputado_federal'
  | 'deputado_estadual'
  | 'prefeito'
  | 'vereador';

export const CARGO_LABELS: Record<CargoType, string> = {
  presidente: 'Presidente',
  governador: 'Governador',
  senador: 'Senador',
  deputado_federal: 'Deputado Federal',
  deputado_estadual: 'Deputado Estadual',
  prefeito: 'Prefeito',
  vereador: 'Vereador',
};

export interface VotingResult {
  id: string;
  candidate_id: string;
  ano_eleicao: number;
  uf: string;
  municipio: string;
  cod_municipio: string;
  zona: string;
  secao: string;
  local_votacao: string;
  votos: number;
  votos_validos_total: number;
  percentual: number;
  lat?: number;
  lng?: number;
}

export interface VotingSummary {
  uf: string;
  municipio?: string;
  total_votos: number;
  percentual_medio: number;
  total_secoes: number;
  melhor_secao_votos: number;
  pior_secao_votos: number;
}

export interface CampaignPlan {
  id: string;
  candidate_id: string;
  cargo: CargoType;
  generated_at: string;
  content: string;
  estrategia_geografica?: string;
  estimativa_custo?: string;
  engajamento?: string;
  status: 'generating' | 'ready' | 'error';
  user_id: string;
}

export interface MapRegion {
  name: string;
  code: string;
  lat: number;
  lng: number;
  votes: number;
  percentage: number;
  level: 'state' | 'city' | 'zone' | 'section';
}
