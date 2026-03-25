import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

Deno.serve(async (req: Request) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;
  const headers = getCorsHeaders(req);

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.slice(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      candidate_id,
      candidate_name,
      partido,
      cargo_atual,
      cargo_alvo,
      uf,
      ano_historico,
    } = body;

    // Fetch voting data for context
    const { data: stateVotes } = await supabase
      .from("voting_results_by_state")
      .select("*")
      .eq("candidate_id", candidate_id)
      .order("total_votos", { ascending: false });

    const { data: topCities } = await supabase
      .from("voting_results_by_city")
      .select("*")
      .eq("candidate_id", candidate_id)
      .order("total_votos", { ascending: false })
      .limit(20);

    const { data: weakCities } = await supabase
      .from("voting_results_by_city")
      .select("*")
      .eq("candidate_id", candidate_id)
      .order("percentual_medio", { ascending: true })
      .limit(20);

    const totalVotes = stateVotes?.reduce((s, v) => s + v.total_votos, 0) || 0;
    const statesSummary = stateVotes?.map(
      (s) => `${s.uf}: ${s.total_votos.toLocaleString()} votos (${s.percentual_medio.toFixed(1)}%)`
    ).join("\n") || "Sem dados disponíveis";

    const topCitiesSummary = topCities?.map(
      (c) => `${c.municipio}/${c.uf}: ${c.total_votos.toLocaleString()} votos (${c.percentual_medio.toFixed(1)}%)`
    ).join("\n") || "Sem dados";

    const weakCitiesSummary = weakCities?.map(
      (c) => `${c.municipio}/${c.uf}: ${c.total_votos.toLocaleString()} votos (${c.percentual_medio.toFixed(1)}%)`
    ).join("\n") || "Sem dados";

    const CARGO_CONFIG: Record<string, { eleitores_min: string; custo_medio_voto: string; foco: string }> = {
      presidente: {
        eleitores_min: "~155 milhões",
        custo_medio_voto: "R$ 15-30",
        foco: "Nacional: TV, redes sociais, comícios em capitais, alianças partidárias nacionais",
      },
      governador: {
        eleitores_min: "Varia por estado (SP ~33M, AC ~600K)",
        custo_medio_voto: "R$ 8-20",
        foco: "Estadual: TV regional, carreatas, alianças com prefeitos e vereadores",
      },
      senador: {
        eleitores_min: "Varia por estado",
        custo_medio_voto: "R$ 5-15",
        foco: "Estadual: forte presença nas cidades do interior, redes sociais, rádio",
      },
      deputado_federal: {
        eleitores_min: "Quociente eleitoral varia por estado",
        custo_medio_voto: "R$ 3-10",
        foco: "Regional: concentrar votos em zonas eleitorais específicas, presença em bairros, igrejas, associações",
      },
      deputado_estadual: {
        eleitores_min: "Quociente eleitoral estadual",
        custo_medio_voto: "R$ 2-8",
        foco: "Local/Regional: bairros, comunidades, vereadores aliados, corpo a corpo",
      },
      prefeito: {
        eleitores_min: "Eleitores do município",
        custo_medio_voto: "R$ 3-12",
        foco: "Municipal: presença em bairros, debates, redes sociais locais, panfletagem",
      },
      vereador: {
        eleitores_min: "Quociente eleitoral municipal",
        custo_medio_voto: "R$ 1-5",
        foco: "Bairros/Comunidades: corpo a corpo, redes sociais, lideranças comunitárias",
      },
    };

    const cargoConfig = CARGO_CONFIG[cargo_alvo] || CARGO_CONFIG.deputado_federal;

    const prompt = `Você é um estrategista político e consultor de campanha eleitoral brasileiro com 30 anos de experiência.
Sua missão é criar um PLANEJAMENTO ESTRATÉGICO DE CAMPANHA COMPLETO para as eleições de 2026 no Brasil.

## CANDIDATO
- Nome: ${candidate_name}
- Partido: ${partido}
- Cargo disputado anteriormente: ${cargo_atual} (${ano_historico})
- Cargo alvo em 2026: ${cargo_alvo}
- UF base: ${uf || "Nacional"}
- Total de votos na última eleição: ${totalVotes.toLocaleString()}

## DADOS DE VOTAÇÃO HISTÓRICA POR ESTADO
${statesSummary}

## TOP 20 MUNICÍPIOS ONDE MAIS VOTOU
${topCitiesSummary}

## 20 MUNICÍPIOS MAIS FRACOS
${weakCitiesSummary}

## PARÂMETROS DO CARGO "${cargo_alvo.toUpperCase()}"
- Eleitorado: ${cargoConfig.eleitores_min}
- Custo médio por voto: ${cargoConfig.custo_medio_voto}
- Foco principal: ${cargoConfig.foco}

## INSTRUÇÕES

Crie um planejamento de campanha COMPLETO e DETALHADO incluindo TODOS os seguintes blocos:

### 1. DIAGNÓSTICO ELEITORAL
- Análise SWOT do candidato baseada nos dados de votação
- Identificação de redutos eleitorais (onde é forte)
- Identificação de "desertos eleitorais" (onde precisa crescer)
- Comparação do desempenho por região/estado
- Projeção de votos necessários para 2026

### 2. ESTRATÉGIA GEOGRÁFICA
- Mapa de prioridades: quais municípios/estados focar
- Classificação em 3 níveis:
  * CONSOLIDAR: onde já é forte (manter/ampliar)
  * CONQUISTAR: onde tem potencial mas precisa crescer
  * SEMEAR: onde é fraco, investimento de longo prazo
- Para cada nível, definir ações específicas e orçamento proporcional
- Calcular meta de votos por município/região

### 3. CRONOGRAMA DE CAMPANHA (18 meses)
- Fase 1 (Jan-Jun 2025): Pré-campanha — presença digital, articulação política
- Fase 2 (Jul-Dez 2025): Aquecimento — eventos, alianças, pesquisas
- Fase 3 (Jan-Mai 2026): Preparação — convenções, filiações, material
- Fase 4 (Jun-Ago 2026): Campanha oficial — TV, rádio, redes, comícios
- Fase 5 (Set-Out 2026): Sprint final — intensificação, debates, mobilização

### 4. ORÇAMENTO DETALHADO
- Estimativa TOTAL de campanha com breakdown por categoria:
  * Marketing digital (redes sociais, Google, YouTube)
  * Material gráfico (santinhos, bandeiras, adesivos)
  * Eventos e comícios
  * Equipe de campo (cabos eleitorais)
  * Pesquisas de opinião
  * Assessoria jurídica e contábil
  * Produção de conteúdo (vídeos, jingles)
  * Deslocamento e logística
- Custo por voto estimado
- ROI esperado por canal
- Estratégias de ECONOMIA (como reduzir custos sem perder efetividade)

### 5. ESTRATÉGIA DIGITAL
- Plataformas prioritárias (Instagram, TikTok, YouTube, WhatsApp, X)
- Frequência de postagem por plataforma
- Tipos de conteúdo que geram mais engajamento eleitoral
- Estratégia de anúncios pagos (segmentação geográfica baseada nos dados)
- Gestão de crise e monitoramento de fake news
- Uso de IA para personalização de mensagens

### 6. ENGAJAMENTO E MOBILIZAÇÃO
- Estratégia de voluntariado
- Programa de lideranças comunitárias
- Eventos presenciais por região
- Sistema de porta a porta
- Grupos de WhatsApp segmentados
- Pesquisa de demandas locais
- Como transformar eleitor em militante

### 7. ALIANÇAS E COLIGAÇÕES
- Partidos potenciais para coligação
- Critérios para escolha de vice/suplente
- Articulação com prefeitos e vereadores
- Apoios de lideranças estaduais

### 8. COMUNICAÇÃO E NARRATIVA
- Proposta de slogan
- 3 pilares da mensagem de campanha
- Tom de voz e posicionamento
- Agenda positiva vs. resposta a adversários
- Discurso adaptado por público (jovens, idosos, classe média, periferia, rural)

### 9. MÉTRICAS E KPIs
- KPIs de campanha por fase
- Pesquisas de acompanhamento (quando e quantas)
- Dashboard de monitoramento sugerido
- Critérios de ajuste de rota

### 10. RISCOS E CONTINGÊNCIAS
- Top 5 riscos da campanha
- Plano de contingência para cada risco
- Protocolo de gestão de crise

IMPORTANTE:
- Use dados REAIS e específicos do candidato fornecidos acima
- Seja QUANTITATIVO: dê números, percentuais, valores em reais
- Adapte tudo ao cargo "${cargo_alvo}" — não generalize
- Considere a legislação eleitoral brasileira vigente
- Foque em ECONOMIA de campanha e MÁXIMO engajamento
- Formate em Markdown com headers, bullets, tabelas e destaques`;

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const plan = result.content?.[0]?.text || "Erro ao gerar plano";

    return new Response(JSON.stringify({
      plan,
      estrategia_geografica: "Incluída no plano",
      estimativa_custo: "Incluída no plano",
      engajamento: "Incluído no plano",
    }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    console.error("[generate-campaign-plan] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
