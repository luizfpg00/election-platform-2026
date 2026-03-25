/**
 * import-candidate-votes.mjs
 *
 * Downloads voting data from TSE CDN for a specific candidate
 * and imports into Supabase.
 *
 * Usage:
 *   node scripts/import-candidate-votes.mjs --ano 2022 --uf RJ --numero 22070 --nome "MÁRCIO GUALBERTO" --cargo deputado_estadual
 *
 * Env vars:
 *   SUPABASE_URL (default: from .env)
 *   SUPABASE_SERVICE_KEY
 */

import { createReadStream, existsSync, createWriteStream } from 'fs';
import { createInterface } from 'readline';
import { mkdir, readdir, unlink, readFile } from 'fs/promises';
import { execSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// ─── Config ──────────────────────────────────────────────────
const CDN_BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele';

// Load .env
try {
  const envContent = await readFile('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) {
      const k = key.trim();
      const v = vals.join('=').trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
} catch { /* no .env */ }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  console.error('Example: set SUPABASE_SERVICE_KEY=eyJ... && node scripts/import-candidate-votes.mjs --ano 2022 --uf RJ --numero 22070 --nome "MÁRCIO GUALBERTO" --cargo deputado_estadual');
  process.exit(1);
}

// ─── Parse Args ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ano: 2022, uf: null, numero: null, nome: null, cargo: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ano') opts.ano = parseInt(args[++i]);
    if (args[i] === '--uf') opts.uf = args[++i]?.toUpperCase();
    if (args[i] === '--numero') opts.numero = parseInt(args[++i]);
    if (args[i] === '--nome') opts.nome = args[++i];
    if (args[i] === '--cargo') opts.cargo = args[++i];
  }
  return opts;
}

// ─── Download & Extract ──────────────────────────────────────
async function downloadFile(url, destPath) {
  console.log(`  Downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const fileStream = createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), fileStream);
  console.log(`  Saved to: ${destPath}`);
}

async function extractZip(zipPath, destDir) {
  await mkdir(destDir, { recursive: true });
  // Use PowerShell to extract on Windows
  console.log(`  Extracting ZIP...`);
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' });
  } catch {
    // Try tar as fallback
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
  }
  console.log(`  Extracted to: ${destDir}`);
}

// ─── Parse CSV ───────────────────────────────────────────────
async function parseCsvForCandidate(csvPath, numero, nome, ano) {
  console.log(`  Parsing: ${csvPath}`);
  const results = [];

  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: 'latin1' }),
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

    const get = (col) => parts[headerMap[col]] ?? '';

    // Filter by candidate number
    const nrCandidato = parseInt(get('NR_VOTAVEL') || get('NR_CANDIDATO'));
    if (nrCandidato !== numero) continue;

    // Only first round
    const turno = get('NR_TURNO');
    if (turno && turno !== '1') continue;

    const votos = parseInt(get('QT_VOTOS')) || 0;
    if (votos <= 0) continue;

    results.push({
      ano_eleicao: ano,
      uf: get('SG_UF'),
      municipio: get('NM_MUNICIPIO') || get('NM_VOTAVEL'),
      cod_municipio: get('CD_MUNICIPIO'),
      zona: get('NR_ZONA'),
      secao: get('NR_SECAO') || '',
      local_votacao: get('NM_LOCAL_VOTACAO') || '',
      votos,
      votos_validos_total: parseInt(get('QT_VOTOS_NOMINAIS_VALIDOS') || get('QT_VOTOS_NOMINAIS')) || 0,
    });

    if (lineCount % 500000 === 0) {
      process.stdout.write(`  ${lineCount.toLocaleString()} lines scanned, ${results.length} matches...\r`);
    }
  }

  console.log(`  ${lineCount.toLocaleString()} lines, ${results.length} vote records for candidate #${numero}`);
  return results;
}

// ─── Supabase ────────────────────────────────────────────────
async function supabasePost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase POST ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  if (!opts.numero) {
    console.error('Usage: node scripts/import-candidate-votes.mjs --ano 2022 --uf RJ --numero 22070 --nome "MÁRCIO GUALBERTO" --cargo deputado_estadual');
    process.exit(1);
  }

  console.log('═'.repeat(60));
  console.log('  TSE Voting Data Import');
  console.log(`  Candidato: ${opts.nome || '?'} #${opts.numero}`);
  console.log(`  Ano: ${opts.ano} | UF: ${opts.uf || 'ALL'} | Cargo: ${opts.cargo || '?'}`);
  console.log('═'.repeat(60));

  // Step 1: Ensure candidate exists in DB
  console.log('\n1. Creating/updating candidate in DB...');
  const candidateData = {
    nome: opts.nome || `Candidato #${opts.numero}`,
    nome_urna: opts.nome || `#${opts.numero}`,
    numero: opts.numero,
    partido: 'N/A',
    cargo: opts.cargo || 'deputado_estadual',
    uf: opts.uf,
    ano_eleicao: opts.ano,
  };

  const [candidate] = await supabasePost('candidates', candidateData);
  const candidateId = candidate.id;
  console.log(`  Candidate ID: ${candidateId}`);

  // Step 2: Download voting data
  const tmpDir = `./tmp_tse_${opts.ano}`;
  await mkdir(tmpDir, { recursive: true });

  // Try section-level data first, fall back to munzona
  const datasets = [
    { name: 'votacao_secao', path: `votacao_secao/votacao_secao_${opts.ano}_${opts.uf || 'BR'}.zip` },
    { name: 'votacao_munzona', path: `votacao_candidato_munzona/votacao_candidato_munzona_${opts.ano}.zip` },
  ];

  let voteRecords = [];

  for (const ds of datasets) {
    const zipUrl = `${CDN_BASE}/${ds.path}`;
    const zipPath = `${tmpDir}/${ds.name}.zip`;
    const extractDir = `${tmpDir}/${ds.name}`;

    try {
      console.log(`\n2. Downloading ${ds.name}...`);

      if (!existsSync(zipPath)) {
        await downloadFile(zipUrl, zipPath);
      } else {
        console.log(`  Using cached: ${zipPath}`);
      }

      console.log('\n3. Extracting...');
      await extractZip(zipPath, extractDir);

      // Find CSV files
      const files = await readdir(extractDir, { recursive: true });
      const csvFiles = files.filter(f => f.endsWith('.csv') || f.endsWith('.CSV'));
      console.log(`  Found ${csvFiles.length} CSV files`);

      // Filter for specific UF if provided
      const targetCsvs = opts.uf
        ? csvFiles.filter(f => f.toUpperCase().includes(opts.uf))
        : csvFiles;

      console.log(`  Processing ${targetCsvs.length} CSV files for UF=${opts.uf || 'ALL'}...`);

      for (const csv of targetCsvs) {
        const csvPath = `${extractDir}/${csv}`;
        const records = await parseCsvForCandidate(csvPath, opts.numero, opts.nome, opts.ano);
        voteRecords.push(...records);
      }

      if (voteRecords.length > 0) break; // Found data, no need to try next dataset
    } catch (err) {
      console.error(`  Error with ${ds.name}: ${err.message}`);
      continue;
    }
  }

  if (voteRecords.length === 0) {
    console.error('\nNo vote records found for this candidate.');
    process.exit(1);
  }

  // Calculate percentuals
  for (const r of voteRecords) {
    r.percentual = r.votos_validos_total > 0
      ? parseFloat(((r.votos / r.votos_validos_total) * 100).toFixed(2))
      : 0;
    r.candidate_id = candidateId;
  }

  // Step 3: Upload to Supabase
  console.log(`\n4. Uploading ${voteRecords.length} vote records to Supabase...`);
  let totalInserted = 0;

  for (let i = 0; i < voteRecords.length; i += 200) {
    const batch = voteRecords.slice(i, i + 200);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/voting_results`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      });
      totalInserted += batch.length;
      process.stdout.write(`  ${totalInserted}/${voteRecords.length}\r`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
    }
  }
  console.log(`  ${totalInserted} records inserted`);

  // Step 4: Refresh materialized views
  console.log('\n5. Refreshing materialized views...');
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
    console.log('  Run manually: SELECT refresh_voting_views();');
  }

  // Summary
  const byState = {};
  for (const r of voteRecords) {
    if (!byState[r.uf]) byState[r.uf] = { votos: 0, secoes: 0 };
    byState[r.uf].votos += r.votos;
    byState[r.uf].secoes++;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  IMPORT COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Candidato: ${opts.nome} #${opts.numero}`);
  console.log(`  Total votos: ${voteRecords.reduce((s, r) => s + r.votos, 0).toLocaleString()}`);
  console.log(`  Registros: ${totalInserted}`);
  console.log('\n  Por estado:');
  for (const [uf, data] of Object.entries(byState).sort((a, b) => b[1].votos - a[1].votos)) {
    console.log(`    ${uf}: ${data.votos.toLocaleString()} votos (${data.secoes} seções)`);
  }
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
