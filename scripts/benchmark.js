// ILM API Benchmark — 5 runs per endpoint, 3 platforms (using native fetch)
const fs = require('fs');
const path = require('path');

const FLY = 'https://ilm-api-prod.fly.dev';
const RENDER = 'https://ilm-api-prod.onrender.com';
const SUPA = 'https://gghgkgmgxsqkqkabtnch.supabase.co';

const JWT = process.argv[2];
const ANON = process.argv[3];
if (!JWT || !ANON) { console.error('Usage: node benchmark.js <JWT> <ANON_KEY>'); process.exit(1); }

async function timed(url, headers) {
  const start = performance.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    await res.text();
    return Math.round(performance.now() - start);
  } catch { return 9999; }
}

async function timedJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  return res.json();
}

async function bench(url, headers, runs = 5) {
  const times = [];
  for (let i = 0; i < runs; i++) times.push(await timed(url, headers));
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const sorted = [...times].sort((a, b) => a - b);
  return { avg, p50: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted[sorted.length - 1] };
}

const apiH = { Authorization: `Bearer ${JWT}` };
const sbH = { apikey: ANON, Authorization: `Bearer ${JWT}` };

async function main() {
  console.log('Warming up...');
  for (let i = 0; i < 3; i++) {
    await timed(`${FLY}/api/turmas?limit=1`, apiH);
    await timed(`${RENDER}/api/turmas?limit=1`, apiH);
    await timed(`${SUPA}/rest/v1/turma?select=id&limit=1`, sbH);
  }

  const escolaId = (await timedJson(`${FLY}/api/escolas?limit=1&ativo=true`, apiH)).data[0].id;
  const muniId = (await timedJson(`${FLY}/api/municipios?limit=1&ativo=true`, apiH)).data[0].id;
  const cicloId = (await timedJson(`${FLY}/api/ciclos`, apiH)).data[0].id;

  // Data parity
  const apiTurmas = (await timedJson(`${FLY}/api/turmas?ativo=true&limit=1`, apiH)).meta.total;
  const apiEscolas = (await timedJson(`${FLY}/api/escolas?ativo=true&limit=1`, apiH)).meta.total;
  const apiMunis = (await timedJson(`${FLY}/api/municipios?ativo=true&limit=1`, apiH)).meta.total;
  const apiCiclos = (await timedJson(`${FLY}/api/ciclos`, apiH)).data.length;
  const sbTurmas = (await timedJson(`${SUPA}/rest/v1/turma?select=id&ativo=eq.true`, sbH)).length;
  const sbEscolas = (await timedJson(`${SUPA}/rest/v1/escola?select=id&ativo=eq.true`, sbH)).length;
  const sbMunis = (await timedJson(`${SUPA}/rest/v1/municipio?select=id&ativo=eq.true`, sbH)).length;
  const sbCiclos = (await timedJson(`${SUPA}/rest/v1/ciclo?select=id`, sbH)).length;

  console.log('Running benchmarks (5 runs each)...\n');

  const endpoints = [
    ['Turma list (20)', `/api/turmas?limit=20&ativo=true`, `/rest/v1/turma?select=id,nome,escola_id,ciclo_id,ativo&ativo=eq.true&order=nome&limit=20`],
    ['Turma by escola', `/api/turmas?escola_id=${escolaId}&ativo=true&limit=100`, `/rest/v1/turma?select=id,nome,ciclo_id&escola_id=eq.${escolaId}&ativo=eq.true&order=nome`],
    ['Turma by ciclo', `/api/turmas?ciclo_id=${cicloId}&ativo=true&limit=100`, `/rest/v1/turma?select=id&ciclo_id=eq.${cicloId}&ativo=eq.true`],
    ['Escola list (20)', `/api/escolas?limit=20&ativo=true`, `/rest/v1/escola?select=id,nome,municipio_id,ativo&ativo=eq.true&order=nome&limit=20`],
    ['Escola by municipio', `/api/escolas?municipio_id=${muniId}&ativo=true&limit=100`, `/rest/v1/escola?select=id,nome&municipio_id=eq.${muniId}&ativo=eq.true&order=nome`],
    ['Municipio list', `/api/municipios?ativo=true&limit=100`, `/rest/v1/municipio?select=id,nome,uf_sigla&ativo=eq.true&order=nome`],
    ['Single municipio', `/api/municipios/${muniId}`, `/rest/v1/municipio?select=*&id=eq.${muniId}`],
    ['Ciclo list', `/api/ciclos`, `/rest/v1/ciclo?select=id,nome&order=nome`],
    ['Livros ativos', `/api/municipios/${muniId}/livros-ativos`, `/rest/v1/municipio_livros_ativos?select=livro_id&municipio_id=eq.${muniId}`],
    ['Health check', `/health`, `/rest/v1/`],
  ];

  const results = [];
  for (const [label, apiPath, sbPath] of endpoints) {
    process.stdout.write(`  ${label}...`);
    const isHealth = label === 'Health check';
    const fly = await bench(`${FLY}${apiPath}`, isHealth ? {} : apiH);
    const render = await bench(`${RENDER}${apiPath}`, isHealth ? {} : apiH);
    const supabase = await bench(`${SUPA}${sbPath}`, sbH);
    results.push({ label, fly, render, supabase });
    console.log(` fly:${fly.avg}ms render:${render.avg}ms supa:${supabase.avg}ms`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    runs_per_endpoint: 5,
    platforms: {
      fly: { url: FLY, region: 'gru (Sao Paulo)', plan: 'shared-cpu-1x, 512MB' },
      render: { url: RENDER, region: 'Ohio (US East)', plan: 'Starter ($7/mo)' },
      supabase: { url: SUPA, region: 'sa-east-1 (Sao Paulo)', type: 'PostgREST + RLS' },
    },
    parity: {
      turmas: { api: apiTurmas, supabase: sbTurmas, match: apiTurmas === sbTurmas },
      escolas: { api: apiEscolas, supabase: sbEscolas, match: apiEscolas === sbEscolas },
      municipios: { api: apiMunis, supabase: sbMunis, match: apiMunis === sbMunis },
      ciclos: { api: apiCiclos, supabase: sbCiclos, match: apiCiclos === sbCiclos },
    },
    results,
  };

  const outPath = path.join(__dirname, '..', 'benchmark-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${outPath}`);
}

main().catch(console.error);