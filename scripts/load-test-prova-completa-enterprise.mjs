/**
 * Prova completa enterprise (staging-load ONLY):
 *  - listagens: docs, recebimentos, materiais, atendimento, RIR, RNC
 *  - agregados: métricas, saldo recebido, operacao_contagens
 *  - burst parallel=20 nas listagens ops
 *  - OCC atendimento (20×2) ≥95%
 *
 * Critério: ≥95% sucesso; listagens 1× sem timeout.
 *
 *   node --use-system-ca scripts/load-test-prova-completa-enterprise.mjs
 *   node --use-system-ca scripts/load-test-prova-completa-enterprise.mjs --skip-occ --parallel 20
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertLoadTestStagingOnly } from './load-test-staging-guard.mjs';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile('.env.staging');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.ISO_PRO_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const tenant =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

assertLoadTestStagingOnly(url);
if (!url || !key || !tenant) {
  console.error('Faltam URL/KEY/TENANT staging.');
  process.exit(1);
}

const args = process.argv.slice(2);
const skipOcc = args.includes('--skip-occ');
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PARALLEL = Number(arg('--parallel', '20'));
const MIN_DOCS = Number(arg('--min-docs', '150000'));
const MIN_ATD = Number(arg('--min-atd', '40000'));
const MIN_RIR = Number(arg('--min-rir', '20000'));
const MIN_RNC = Number(arg('--min-rnc', '10000'));

const sb = createClient(url, key, { auth: { persistSession: false } });
const results = [];

async function timeRpc(name, params) {
  const t0 = performance.now();
  const { data, error } = await sb.rpc(name, params);
  return { data, error, ms: Math.round(performance.now() - t0) };
}

function push(label, ok, ms, detail) {
  results.push({ label, ok, ms, detail });
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}: ${ms}ms ${detail ?? ''}`);
}

console.log('=== Prova completa enterprise ===');
console.log(`host=${new URL(url).hostname} parallel=${PARALLEL}`);

// --- Smoke listagens / agregados ---
{
  const { data, error, ms } = await timeRpc('iso_pro_list_documentos_planejamento_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: 'todos',
  });
  const total = Number(data?.total);
  push(
    'docs page',
    !error && total >= MIN_DOCS,
    ms,
    error ? error.message : `total=${total}`,
  );
}

{
  const { data, error, ms } = await timeRpc('iso_pro_list_recebimentos_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: null,
    p_modo: null,
  });
  push(
    'recebimentos page',
    !error && Number(data?.total) >= 90000,
    ms,
    error ? error.message : `total=${data?.total}`,
  );
}

{
  const { data, error, ms } = await timeRpc('iso_pro_list_materiais_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_disciplina: null,
    p_ativo: null,
  });
  push(
    'materiais page',
    !error && Number(data?.total) >= 40000,
    ms,
    error ? error.message : `total=${data?.total}`,
  );
}

{
  const { data, error, ms } = await timeRpc('iso_pro_list_atendimento_lotes', {
    p_tenant_id: tenant,
    p_limit: 50,
    p_offset: 0,
    p_q: null,
    p_desde: null,
  });
  const total = Number(data?.totalCount ?? data?.total ?? 0);
  push(
    'atendimento lotes',
    !error && total >= MIN_ATD,
    ms,
    error ? error.message : `total=${total}`,
  );
}

{
  const { data, error, ms } = await timeRpc('iso_pro_list_rir_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: null,
  });
  push(
    'rir page',
    !error && Number(data?.total) >= MIN_RIR,
    ms,
    error ? error.message : `total=${data?.total}`,
  );
}

{
  const { data, error, ms } = await timeRpc('iso_pro_list_rnc_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: null,
  });
  push(
    'rnc page',
    !error && Number(data?.total) >= MIN_RNC,
    ms,
    error ? error.message : `total=${data?.total}`,
  );
}

{
  const { data, error, ms } = await timeRpc('iso_pro_sum_metricas_planejamento_por_codigo', {
    p_tenant_id: tenant,
  });
  const codes = data?.porCodigo ? Object.keys(data.porCodigo).length : 0;
  push('metricas', !error && codes > 0, ms, error ? error.message : `codes=${codes}`);
}

{
  const { data, error, ms } = await timeRpc('iso_pro_operacao_contagens', {
    p_tenant_id: tenant,
  });
  push(
    'operacao_contagens',
    !error && data && !data._error,
    ms,
    error ? error.message : `keys=${data ? Object.keys(data).length : 0}`,
  );
}

// --- Burst ops listagens ---
{
  console.log(`\nBurst ops parallel=${PARALLEL}`);
  const tAll = performance.now();
  const cycles = await Promise.all(
    Array.from({ length: PARALLEL }, async (_, i) => {
      const labels = [];
      for (const [label, name, params] of [
        [
          'docs',
          'iso_pro_list_documentos_planejamento_page',
          { p_tenant_id: tenant, p_busca: null, p_offset: 0, p_limit: 20, p_status: 'todos' },
        ],
        [
          'atd',
          'iso_pro_list_atendimento_lotes',
          { p_tenant_id: tenant, p_limit: 20, p_offset: 0, p_q: null, p_desde: null },
        ],
        [
          'rir',
          'iso_pro_list_rir_page',
          { p_tenant_id: tenant, p_busca: null, p_offset: 0, p_limit: 20, p_status: null },
        ],
        [
          'rnc',
          'iso_pro_list_rnc_page',
          { p_tenant_id: tenant, p_busca: null, p_offset: 0, p_limit: 20, p_status: null },
        ],
        ['contagens', 'iso_pro_operacao_contagens', { p_tenant_id: tenant }],
      ]) {
        const t0 = performance.now();
        const { error } = await sb.rpc(name, params);
        labels.push({
          label,
          ok: !error,
          ms: Math.round(performance.now() - t0),
          error: error?.message,
        });
      }
      return { i, labels };
    }),
  );
  const wall = Math.round(performance.now() - tAll);
  const flat = cycles.flatMap((c) => c.labels);
  const by = {};
  for (const r of flat) {
    (by[r.label] ??= []).push(r);
  }
  let burstOk = 0;
  let burstN = 0;
  for (const [label, rows] of Object.entries(by)) {
    const ok = rows.filter((x) => x.ok).length;
    burstOk += ok;
    burstN += rows.length;
    const ms = rows
      .filter((x) => x.ok)
      .map((x) => x.ms)
      .sort((a, b) => a - b);
    const p95 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : 0;
    console.log(`${label}: ok=${ok}/${rows.length} p95=${p95}ms`);
    if (rows.find((x) => !x.ok)) console.log(`  err=${rows.find((x) => !x.ok).error}`);
  }
  const rate = burstN ? burstOk / burstN : 0;
  push('burst ops', rate >= 0.95, wall, `${burstOk}/${burstN} (${(rate * 100).toFixed(1)}%)`);
}

// --- OCC atendimento ---
if (!skipOcc) {
  console.log('\nOCC atendimento 20×2');
  const r = spawnSync(
    process.execPath,
    [
      '--use-system-ca',
      path.join(root, 'scripts', 'run-load-on-staging.mjs'),
      '--',
      'scripts/load-test-atendimento-comandos.mjs',
      '--operators',
      '20',
      '--rounds',
      '2',
    ],
    { cwd: root, env: process.env, stdio: 'inherit' },
  );
  push('occ comandos 20x2', r.status === 0, 0, `exit=${r.status}`);
} else {
  console.log('\nOCC SKIP');
}

console.log('\n--- resumo ---');
const pass = results.filter((r) => r.ok).length;
const total = results.length;
const rate = total ? pass / total : 0;
console.log(`pass=${pass}/${total} (${(rate * 100).toFixed(1)}%)`);
const failed = results.filter((r) => !r.ok);
if (failed.length) console.error('Falhas:', failed.map((f) => f.label).join(', '));

if (rate < 0.95) {
  console.error('ACEITE NÃO ATINGIDO (<95%).');
  process.exit(2);
}
console.log('ACEITE ≥95%: prova completa enterprise OK.');
process.exit(0);
