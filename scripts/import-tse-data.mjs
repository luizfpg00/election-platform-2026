/**
 * import-tse-data.mjs
 *
 * Downloads and imports TSE (Tribunal Superior Eleitoral) election data
 * into the Supabase database for use by EleiçãoPlan 2026.
 *
 * Usage:
 *   node scripts/import-tse-data.mjs --ano 2022 [--cargo deputado_federal] [--uf SP]
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *
 * Data source: https://dadosabertos.tse.jus.br/dataset/resultados
 * CSV files from TSE contain voting results per section.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { writeFile, mkdir, access } from 'fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

// TSE cargo code mapping
const TSE_CARGO_MAP = {
  1: 'presidente',
  3: 'governador',
  5: 'senador',
  6: 'deputado_federal',
  7: 'deputado_estadual',
  8: 'deputado_distrital',
  11: 'prefeito',
  13: 'vereador',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ano: 2022, cargo: null, uf: null, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ano' && args[i + 1]) opts.ano = parseInt(args[++i]);
    if (args[i] === '--cargo' && args[i + 1]) opts.cargo = args[++i];
    if (args[i] === '--uf' && args[i + 1]) opts.uf = args[++i].toUpperCase();
    if (args[i] === '--file' && args[i + 1]) opts.file = args[++i];
  }
  return opts;
}

async function supabaseRequest(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

async function upsertBatch(table, rows) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    try {
      await supabaseRequest(table, 'POST', batch);
      inserted += batch.length;
    } catch (err) {
      console.error(`  Error inserting batch ${i}: ${err.message}`);
    }
  }
  return inserted;
}

/**
 * Parse a TSE CSV file (votacao_secao_<ano>_<UF>.csv)
 * TSE CSV columns vary by year, but typically include:
 * ANO_ELEICAO, NR_TURNO, SG_UF, CD_MUNICIPIO, NM_MUNICIPIO,
 * NR_ZONA, NR_SECAO, NR_LOCAL_VOTACAO, NM_LOCAL_VOTACAO,
 * CD_CARGO, DS_CARGO, NR_CANDIDATO, NM_CANDIDATO, NM_URNA_CANDIDATO,
 * SG_PARTIDO, QT_VOTOS, NM_VOTAVEL
 */
async function processCSV(filePath, ano) {
  console.log(`Processing: ${filePath}`);

  const candidates = new Map(); // key: `${nome}-${partido}-${cargo}-${uf}`
  const votes = []; // voting results

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let headerMap = null;
  let lineCount = 0;

  for await (const line of rl) {
    lineCount++;
    const parts = line.split(';').map(s => s.replace(/"/g, '').trim());

    if (!headerMap) {
      headerMap = {};
      parts.forEach((col, i) => { headerMap[col] = i; });
      continue;
    }

    const get = (col) => parts[headerMap[col]] || '';

    const turno = get('NR_TURNO');
    if (turno !== '1') continue; // Only first round

    const cdCargo = parseInt(get('CD_CARGO'));
    const cargo = TSE_CARGO_MAP[cdCargo];
    if (!cargo) continue;

    const nrCandidato = parseInt(get('NR_CANDIDATO'));
    if (isNaN(nrCandidato) || nrCandidato <= 0) continue;

    const nome = get('NM_CANDIDATO');
    const nomeUrna = get('NM_URNA_CANDIDATO');
    const partido = get('SG_PARTIDO');
    const uf = get('SG_UF');
    const municipio = get('NM_MUNICIPIO');
    const codMunicipio = get('CD_MUNICIPIO');
    const zona = get('NR_ZONA');
    const secao = get('NR_SECAO');
    const localVotacao = get('NM_LOCAL_VOTACAO') || get('NM_VOTAVEL');
    const qtVotos = parseInt(get('QT_VOTOS')) || 0;

    if (!nome || !partido || qtVotos <= 0) continue;

    // Build candidate key
    const candKey = `${nome}|${partido}|${cargo}|${uf}|${nrCandidato}`;
    if (!candidates.has(candKey)) {
      candidates.set(candKey, {
        nome,
        nome_urna: nomeUrna || nome,
        numero: nrCandidato,
        partido,
        cargo,
        uf,
        ano_eleicao: ano,
      });
    }

    votes.push({
      _candKey: candKey,
      ano_eleicao: ano,
      uf,
      municipio,
      cod_municipio: codMunicipio,
      zona,
      secao,
      local_votacao: localVotacao,
      votos: qtVotos,
    });

    if (lineCount % 100000 === 0) {
      process.stdout.write(`  ${lineCount.toLocaleString()} lines...\r`);
    }
  }

  console.log(`  ${lineCount.toLocaleString()} lines, ${candidates.size} candidates, ${votes.length} vote records`);
  return { candidates, votes };
}

async function main() {
  const opts = parseArgs();

  console.log('═'.repeat(60));
  console.log('  TSE Data Import → EleiçãoPlan 2026');
  console.log(`  Ano: ${opts.ano}`);
  console.log('═'.repeat(60));

  if (!opts.file) {
    console.log(`
Para importar dados do TSE:

1. Acesse: https://dadosabertos.tse.jus.br/dataset/resultados-${opts.ano}
2. Baixe o arquivo CSV de votação por seção (votacao_secao_${opts.ano}_BRASIL.csv)
3. Execute: node scripts/import-tse-data.mjs --ano ${opts.ano} --file caminho/para/arquivo.csv

Alternativamente, baixe por estado:
  node scripts/import-tse-data.mjs --ano 2022 --file votacao_secao_2022_SP.csv
`);
    return;
  }

  // Process CSV
  const { candidates, votes } = await processCSV(opts.file, opts.ano);

  // Insert candidates
  console.log(`\nInserting ${candidates.size} candidates...`);
  const candidateIdMap = new Map();
  const candArray = [...candidates.entries()];

  for (let i = 0; i < candArray.length; i += 200) {
    const batch = candArray.slice(i, i + 200).map(([, c]) => c);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/candidates`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(batch),
    });

    if (res.ok) {
      const inserted = await res.json();
      inserted.forEach((c) => {
        const key = `${c.nome}|${c.partido}|${c.cargo}|${c.uf}|${c.numero}`;
        candidateIdMap.set(key, c.id);
      });
    } else {
      console.error(`  Batch error: ${await res.text()}`);
    }
    process.stdout.write(`  ${Math.min(i + 200, candArray.length)}/${candArray.length}\r`);
  }
  console.log(`  ${candidateIdMap.size} candidates upserted`);

  // Insert voting results
  console.log(`\nInserting ${votes.length} voting results...`);
  let totalInserted = 0;

  for (let i = 0; i < votes.length; i += 200) {
    const batch = votes.slice(i, i + 200)
      .map(v => {
        const candidateId = candidateIdMap.get(v._candKey);
        if (!candidateId) return null;
        const { _candKey, ...rest } = v;
        return { ...rest, candidate_id: candidateId };
      })
      .filter(Boolean);

    if (batch.length > 0) {
      try {
        await supabaseRequest('voting_results', 'POST', batch);
        totalInserted += batch.length;
      } catch (err) {
        console.error(`  Batch ${i} error: ${err.message}`);
      }
    }

    if (i % 10000 === 0) {
      process.stdout.write(`  ${totalInserted.toLocaleString()}/${votes.length.toLocaleString()}\r`);
    }
  }

  console.log(`  ${totalInserted.toLocaleString()} vote records inserted`);

  // Refresh materialized views
  console.log('\nRefreshing materialized views...');
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/refresh_voting_views`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    console.log('  Views refreshed!');
  } catch (err) {
    console.error('  Error refreshing views:', err.message);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  IMPORT COMPLETE');
  console.log(`  Candidates: ${candidateIdMap.size}`);
  console.log(`  Vote records: ${totalInserted.toLocaleString()}`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
