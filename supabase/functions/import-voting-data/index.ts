/**
 * import-voting-data — Downloads voting data from TSE CDN for a candidate
 * and stores in the database.
 *
 * POST /import-voting-data
 * {
 *   candidate_id: "uuid",
 *   numero: 22070,
 *   ano: 2022,
 *   uf: "RJ",
 *   cargo: "deputado_estadual",
 *   nome: "MÁRCIO GUALBERTO",
 *   partido: "PL"
 * }
 *
 * Downloads votacao_candidato_munzona CSV from TSE CDN,
 * parses for the candidate, and upserts into voting_results.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CDN_BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";

const CARGO_TSE_MAP: Record<string, number[]> = {
  presidente: [1],
  governador: [3],
  senador: [5],
  deputado_federal: [6],
  deputado_estadual: [7, 8], // 8 = dep distrital
  prefeito: [11],
  vereador: [13],
};

Deno.serve(async (req: Request) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;
  const headers = getCorsHeaders(req);
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  try {
    const body = await req.json();
    const { candidate_id, numero, ano, uf, cargo, nome, partido } = body;

    if (!numero || !ano) {
      return new Response(JSON.stringify({ error: "numero and ano are required" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Step 1: Ensure candidate exists in DB
    let candId = candidate_id;
    if (!candId) {
      const { data: existing } = await supabase
        .from("candidates")
        .select("id")
        .eq("numero", numero)
        .eq("ano_eleicao", ano)
        .eq("cargo", cargo || "deputado_federal")
        .maybeSingle();

      if (existing) {
        candId = existing.id;
      } else {
        const { data: newCand, error: candErr } = await supabase
          .from("candidates")
          .insert({
            nome: nome || `Candidato #${numero}`,
            nome_urna: nome || `#${numero}`,
            numero,
            partido: partido || "N/A",
            cargo: cargo || "deputado_federal",
            uf: uf || null,
            ano_eleicao: ano,
          })
          .select("id")
          .single();

        if (candErr) throw new Error(`Candidate insert error: ${candErr.message}`);
        candId = newCand.id;
      }
    }

    // Check if we already have voting data for this candidate
    const { count: existingCount } = await supabase
      .from("voting_results")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", candId);

    if (existingCount && existingCount > 0) {
      return new Response(JSON.stringify({
        status: "already_imported",
        candidate_id: candId,
        records: existingCount,
        message: `Já existem ${existingCount} registros de votação para este candidato`,
      }), { headers: jsonHeaders });
    }

    // Step 2: Download ZIP from CDN
    // For state-level elections, try per-state file first
    const ufUpper = (uf || "BR").toUpperCase();
    const zipUrl = `${CDN_BASE}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`;

    console.log(`[import-voting-data] Downloading: ${zipUrl}`);
    const zipRes = await fetch(zipUrl);
    if (!zipRes.ok) {
      throw new Error(`CDN download failed: ${zipRes.status} for ${zipUrl}`);
    }

    const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());
    console.log(`[import-voting-data] ZIP size: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    // Step 3: Extract ZIP
    const files = unzipSync(zipBuffer);
    console.log(`[import-voting-data] Files in ZIP: ${Object.keys(files).join(", ").slice(0, 200)}`);

    // Find CSV files for the target UF
    const csvFiles = Object.entries(files).filter(([name]) => {
      const upper = name.toUpperCase();
      if (!upper.endsWith(".CSV")) return false;
      if (ufUpper !== "BR" && !upper.includes(ufUpper)) return false;
      return true;
    });

    if (csvFiles.length === 0) {
      // If UF-specific not found, try all CSVs
      const allCsvs = Object.entries(files).filter(([name]) =>
        name.toUpperCase().endsWith(".CSV")
      );
      if (allCsvs.length === 0) {
        throw new Error("No CSV files found in ZIP");
      }
      csvFiles.push(...allCsvs);
    }

    console.log(`[import-voting-data] Processing ${csvFiles.length} CSV files`);

    // Step 4: Parse CSVs
    const voteRecords: Record<string, unknown>[] = [];
    const decoder = new TextDecoder("latin1");

    for (const [fileName, fileData] of csvFiles) {
      const content = decoder.decode(fileData);
      const lines = content.split("\n");

      let headerMap: Record<string, number> | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(";").map(s => s.replace(/"/g, "").trim());

        if (!headerMap) {
          headerMap = {};
          parts.forEach((col, idx) => { headerMap![col] = idx; });
          continue;
        }

        const get = (col: string) => parts[headerMap![col]] ?? "";

        // Filter by candidate number
        const nr = parseInt(get("NR_VOTAVEL") || get("NR_CANDIDATO"));
        if (nr !== numero) continue;

        // Only first round
        const turno = get("NR_TURNO");
        if (turno && turno !== "1") continue;

        const votos = parseInt(get("QT_VOTOS_NOMINAIS") || get("QT_VOTOS")) || 0;
        if (votos <= 0) continue;

        const votosValidos = parseInt(get("QT_VOTOS_NOMINAIS_VALIDOS") || get("QT_VOTOS_NOMINAIS")) || votos;

        voteRecords.push({
          candidate_id: candId,
          ano_eleicao: ano,
          uf: get("SG_UF"),
          municipio: get("NM_MUNICIPIO"),
          cod_municipio: get("CD_MUNICIPIO"),
          zona: get("NR_ZONA"),
          secao: "",
          local_votacao: get("NM_MUNICIPIO"),
          votos,
          votos_validos_total: votosValidos,
          percentual: votosValidos > 0 ? parseFloat(((votos / votosValidos) * 100).toFixed(2)) : 0,
        });
      }

      console.log(`[import-voting-data] ${fileName}: found ${voteRecords.length} records so far`);
    }

    if (voteRecords.length === 0) {
      return new Response(JSON.stringify({
        status: "no_data",
        candidate_id: candId,
        message: `Nenhum registro de votação encontrado para candidato #${numero} em ${ano}`,
      }), { headers: jsonHeaders });
    }

    // Step 5: Insert into DB in batches
    let totalInserted = 0;
    for (let i = 0; i < voteRecords.length; i += 200) {
      const batch = voteRecords.slice(i, i + 200);
      const { error } = await supabase.from("voting_results").insert(batch);
      if (error) {
        console.error(`[import-voting-data] Batch ${i} error:`, error.message);
      } else {
        totalInserted += batch.length;
      }
    }

    // Step 6: Refresh materialized views
    try {
      await supabase.rpc("refresh_voting_views");
    } catch (e) {
      console.error("[import-voting-data] View refresh error:", e);
    }

    // Build summary
    const byState: Record<string, { votos: number; zones: number }> = {};
    for (const r of voteRecords) {
      const ufKey = (r as Record<string, unknown>).uf as string;
      if (!byState[ufKey]) byState[ufKey] = { votos: 0, zones: 0 };
      byState[ufKey].votos += (r as Record<string, unknown>).votos as number;
      byState[ufKey].zones++;
    }

    const totalVotes = voteRecords.reduce((s, r) => s + ((r as Record<string, unknown>).votos as number), 0);

    return new Response(JSON.stringify({
      status: "imported",
      candidate_id: candId,
      total_votes: totalVotes,
      total_records: totalInserted,
      by_state: byState,
      message: `Importados ${totalInserted} registros com ${totalVotes.toLocaleString()} votos`,
    }), { headers: jsonHeaders });

  } catch (err: unknown) {
    console.error("[import-voting-data] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
