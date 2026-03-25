/**
 * tse-proxy — Proxy para APIs do TSE (sem CORS)
 *
 * Endpoints:
 *   POST /tse-proxy { action: "search-candidates", ano, ue, cargo }
 *   POST /tse-proxy { action: "candidate-detail", ano, municipio, sqele, candidateId }
 *   POST /tse-proxy { action: "election-years" }
 *   POST /tse-proxy { action: "elections-list" }
 *   POST /tse-proxy { action: "election-results", ciclo, cdEleicao, uf, cargo }
 *   POST /tse-proxy { action: "municipality-config", ciclo, cdEleicao }
 *   POST /tse-proxy { action: "abstention-data", ciclo, cdEleicao, uf }
 *   POST /tse-proxy { action: "section-config", ciclo, cdPleito, uf }
 *   POST /tse-proxy { action: "candidate-photo", sqele, candidateId, municipio }
 *   POST /tse-proxy { action: "voting-by-munzona", ano }  — downloads CSV from CDN
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DIVULGA_BASE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";
const RESULTADOS_BASE = "https://resultados.tse.jus.br/oficial";
const CDN_BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";

// Known election IDs (sqele) per year
const ELECTION_IDS: Record<number, { sqele: string; tipo: string }[]> = {
  2024: [{ sqele: "2045202024", tipo: "municipal" }],
  2022: [{ sqele: "2040602022", tipo: "federal" }],
  2020: [{ sqele: "2030402020", tipo: "municipal" }],
  2018: [{ sqele: "2022802018", tipo: "federal" }],
  2016: [{ sqele: "2", tipo: "municipal" }],
  2014: [{ sqele: "680", tipo: "federal" }],
};

// Cargo codes
const CARGO_CODES: Record<string, number> = {
  presidente: 1,
  governador: 3,
  senador: 5,
  deputado_federal: 6,
  deputado_estadual: 7,
  prefeito: 11,
  vereador: 13,
};

function pad(n: number | string, len: number): string {
  return String(n).padStart(len, "0");
}

async function fetchTSE(url: string): Promise<Response> {
  console.log(`[tse-proxy] Fetching: ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "EleiçãoPlan/1.0",
      "Accept": "application/json",
    },
  });
  return res;
}

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
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
    if (!user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ─── Election Years ──────────────────────────────────────────
    if (action === "election-years") {
      const res = await fetchTSE(`${DIVULGA_BASE}/eleicao/anos-eleitorais`);
      const data = await res.json();
      return new Response(JSON.stringify({ anos: data }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Elections List (all ordinary elections) ─────────────────
    if (action === "elections-list") {
      const res = await fetchTSE(`${DIVULGA_BASE}/eleicao/ordinarias`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Search Candidates ───────────────────────────────────────
    if (action === "search-candidates") {
      const { ano, ue, cargo, nome } = body;
      const year = parseInt(ano) || 2022;
      const elections = ELECTION_IDS[year];
      if (!elections?.length) {
        return new Response(JSON.stringify({ error: `Ano ${year} não suportado`, supported: Object.keys(ELECTION_IDS) }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const cargoCode = CARGO_CODES[cargo] || parseInt(cargo) || 6;
      const sqele = body.sqele || elections[0].sqele;
      const ueParam = ue || "BR";

      const url = `${DIVULGA_BASE}/candidatura/listar/${year}/${ueParam}/${sqele}/${cargoCode}/candidatos`;
      const res = await fetchTSE(url);

      if (!res.ok) {
        const text = await res.text();
        return new Response(JSON.stringify({ error: `TSE API error: ${res.status}`, detail: text }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      let candidatos = data.candidatos || [];

      // Filter by name if provided
      if (nome) {
        const normalizedName = nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        candidatos = candidatos.filter((c: Record<string, string>) => {
          const n1 = (c.nomeCompleto || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const n2 = (c.nomeUrna || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return n1.includes(normalizedName) || n2.includes(normalizedName);
        });
      }

      return new Response(JSON.stringify({
        unidadeEleitoral: data.unidadeEleitoral,
        cargo: data.cargo,
        total: candidatos.length,
        candidatos: candidatos.slice(0, 100),
      }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Candidate Detail ────────────────────────────────────────
    if (action === "candidate-detail") {
      const { ano, municipio, sqele, candidateId } = body;
      const url = `${DIVULGA_BASE}/candidatura/buscar/${ano}/${municipio || "BR"}/${sqele}/${candidateId}`;
      const res = await fetchTSE(url);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `TSE error: ${res.status}` }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Candidate Photo ─────────────────────────────────────────
    if (action === "candidate-photo") {
      const { sqele, candidateId, municipio } = body;
      const url = `${DIVULGA_BASE.replace("/rest/v1", "")}/rest/arquivo/img/${sqele}/${candidateId}/${municipio || "BR"}`;
      const res = await fetch(url);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Foto não encontrada" }), {
          status: 404,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const imgBuffer = await res.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
      return new Response(JSON.stringify({ photo: `data:image/jpeg;base64,${base64}` }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Election Results (by state, municipality) ───────────────
    if (action === "election-results") {
      const { ciclo, cdEleicao, uf, cargo: cargoParam } = body;
      const c = ciclo || "2024";
      const cd = cdEleicao || "619";
      const ufLower = (uf || "sp").toLowerCase();
      const cargoCode = pad(CARGO_CODES[cargoParam] || parseInt(cargoParam) || 11, 4);
      const cdPad = pad(cd, 6);

      const url = `${RESULTADOS_BASE}/ele${c}/${cd}/dados/${ufLower}/${ufLower}-c${cargoCode}-e${cdPad}-e.json`;
      const res = await fetchTSE(url);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Resultados não disponíveis: ${res.status}` }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Municipality Config (zones, sections) ───────────────────
    if (action === "municipality-config") {
      const { ciclo, cdEleicao } = body;
      const c = ciclo || "2024";
      const cd = cdEleicao || "619";
      const cdPad = pad(cd, 6);

      const url = `${RESULTADOS_BASE}/ele${c}/${cd}/config/mun-e${cdPad}-cm.json`;
      const res = await fetchTSE(url);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Config não disponível: ${res.status}` }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Abstention / Turnout Data ───────────────────────────────
    if (action === "abstention-data") {
      const { ciclo, cdEleicao, uf } = body;
      const c = ciclo || "2024";
      const cd = cdEleicao || "619";
      const ufLower = (uf || "sp").toLowerCase();
      const cdPad = pad(cd, 6);

      const url = `${RESULTADOS_BASE}/ele${c}/${cd}/dados/${ufLower}/${ufLower}-e${cdPad}-ab.json`;
      const res = await fetchTSE(url);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Dados de abstenção não disponíveis: ${res.status}` }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Section Config (ballot box mapping) ─────────────────────
    if (action === "section-config") {
      const { ciclo, cdPleito, uf } = body;
      const c = ciclo || "2024";
      const pl = cdPleito || "452";
      const ufLower = (uf || "sp").toLowerCase();
      const plPad = pad(pl, 6);

      const url = `${RESULTADOS_BASE}/ele${c}/arquivo-urna/${pl}/config/${ufLower}/${ufLower}-p${plPad}-cs.json`;
      const res = await fetchTSE(url);
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `Config de seções não disponível: ${res.status}` }), {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── CDN Download URL (returns URL for bulk CSV) ─────────────
    if (action === "cdn-download-url") {
      const { ano, dataset } = body;
      const datasets: Record<string, string> = {
        candidatos: `consulta_cand/consulta_cand_${ano}.zip`,
        votacao_munzona: `votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`,
        votacao_secao: `detalhe_votacao_secao/detalhe_votacao_secao_${ano}.zip`,
        votacao_partido: `votacao_partido_munzona/votacao_partido_munzona_${ano}.zip`,
        eleitorado: `perfil_eleitorado/perfil_eleitorado_${ano}.zip`,
      };

      const path = datasets[dataset || "votacao_munzona"];
      if (!path) {
        return new Response(JSON.stringify({
          error: "Dataset não encontrado",
          available: Object.keys(datasets),
        }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        url: `${CDN_BASE}/${path}`,
        dataset,
        ano,
      }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Search across all UFs for a candidate ───────────────────
    if (action === "search-all-states") {
      const { ano, cargo, nome } = body;
      const year = parseInt(ano) || 2022;
      const elections = ELECTION_IDS[year];
      if (!elections?.length) {
        return new Response(JSON.stringify({ error: `Ano ${year} não suportado` }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const cargoCode = CARGO_CODES[cargo] || 6;
      const sqele = elections[0].sqele;
      const UFS = [
        "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
        "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"
      ];

      // For national cargos, search BR
      if (cargoCode <= 5) {
        const url = `${DIVULGA_BASE}/candidatura/listar/${year}/BR/${sqele}/${cargoCode}/candidatos`;
        const res = await fetchTSE(url);
        if (!res.ok) {
          return new Response(JSON.stringify({ error: `TSE error: ${res.status}` }), {
            status: 502,
            headers: { ...headers, "Content-Type": "application/json" },
          });
        }
        const data = await res.json();
        let candidatos = data.candidatos || [];

        if (nome) {
          const norm = nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          candidatos = candidatos.filter((c: Record<string, string>) => {
            const n = ((c.nomeCompleto || "") + " " + (c.nomeUrna || ""))
              .toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return n.includes(norm);
          });
        }

        return new Response(JSON.stringify({
          total: candidatos.length,
          candidatos: candidatos.slice(0, 50),
        }), {
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      // For state-level cargos, search each UF
      const allCandidates: Record<string, unknown>[] = [];
      const normalizedName = nome
        ? nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        : null;

      // Search in parallel batches of 5
      for (let i = 0; i < UFS.length; i += 5) {
        const batch = UFS.slice(i, i + 5);
        const promises = batch.map(async (uf) => {
          try {
            const url = `${DIVULGA_BASE}/candidatura/listar/${year}/${uf}/${sqele}/${cargoCode}/candidatos`;
            const res = await fetchTSE(url);
            if (!res.ok) return [];
            const data = await res.json();
            let candidatos = (data.candidatos || []).map((c: Record<string, unknown>) => ({
              ...c,
              uf,
            }));
            if (normalizedName) {
              candidatos = candidatos.filter((c: Record<string, string>) => {
                const n = ((c.nomeCompleto || "") + " " + (c.nomeUrna || ""))
                  .toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return n.includes(normalizedName);
              });
            }
            return candidatos;
          } catch {
            return [];
          }
        });
        const results = await Promise.all(promises);
        for (const r of results) allCandidates.push(...r);
      }

      return new Response(JSON.stringify({
        total: allCandidates.length,
        candidatos: allCandidates.slice(0, 100),
      }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Dados Abertos CKAN — Dataset Search ─────────────────────
    if (action === "dataset-search") {
      const { query, rows } = body;
      const url = `https://dadosabertos.tse.jus.br/api/3/action/package_search?q=${encodeURIComponent(query || "resultados")}&rows=${rows || 10}`;
      const res = await fetchTSE(url);
      const data = await res.json();
      return new Response(JSON.stringify(data.result || data), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // ─── Unknown action ──────────────────────────────────────────
    return new Response(JSON.stringify({
      error: `Ação "${action}" não reconhecida`,
      available_actions: [
        "election-years",
        "elections-list",
        "search-candidates",
        "search-all-states",
        "candidate-detail",
        "candidate-photo",
        "election-results",
        "municipality-config",
        "abstention-data",
        "section-config",
        "cdn-download-url",
        "dataset-search",
      ],
    }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    console.error("[tse-proxy] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
