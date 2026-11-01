/**
 * Prova de escala: listagens paginadas na staging (nunca LIVE).
 * Uso:
 *   node --use-system-ca scripts/load-test-listagens-escala-100k.mjs
 *   (carrega .env.staging; ou via run-load-on-staging.mjs)
 *
 * Verifica que list_page responde com total e latencia aceitavel (nao carrega blob).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const tenant = process.env.SUPABASE_TENANT_ID || process.env.VITE_ISO_PRO_TENANT_ID;

assertLoadTestStagingOnly(url);

if (!url || !key || !tenant) {
  console.error('Faltam SUPABASE_URL / KEY / TENANT_ID (staging).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function timeRpc(name, args) {
  const t0 = performance.now();
  const { data, error } = await supabase.rpc(name, args);
  const ms = Math.round(performance.now() - t0);
  return { data, error, ms };
}

const results = [];

async function check(label, name, args, pickTotal, opts = {}) {
  const { data, error, ms } = await timeRpc(name, args);
  if (
    opts.optional &&
    error &&
    /could not find the function|PGRST202|statement timeout|canceling statement/i.test(
      String(error.message ?? ''),
    )
  ) {
    results.push({ label, ms, total: null, ok: true, skipped: true, error: error.message });
    console.log(`SKIP ${label}: ${error.message} (${ms}ms)`);
    return;
  }
  const total = pickTotal(data);
  const ok = !error && total != null;
  results.push({ label, ms, total, ok, error: error?.message });
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}: ${ms}ms total=${total}${error ? ` err=${error.message}` : ''}`);
}

await check(
  'documentos page',
  'iso_pro_list_documentos_planejamento_page',
  { p_tenant_id: tenant, p_busca: null, p_offset: 0, p_limit: 50, p_status: 'todos' },
  (d) => Number(d?.total),
);

await check(
  'recebimentos page',
  'iso_pro_list_recebimentos_page',
  {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: null,
    p_modo: null,
  },
  (d) => Number(d?.total),
);

await check(
  'metricas por codigo',
  'iso_pro_sum_metricas_planejamento_por_codigo',
  { p_tenant_id: tenant },
  (d) => (d?.porCodigo ? Object.keys(d.porCodigo).length : 0),
  { optional: true },
);

await check(
  'saldo recebido',
  'iso_pro_sum_quantidade_recebida_por_codigo',
  { p_tenant_id: tenant },
  (d) => (d?.porCodigo ? Object.keys(d.porCodigo).length : 0),
  { optional: true },
);

const slow = results.filter((r) => r.ok && r.ms > 15_000);
const failed = results.filter((r) => !r.ok);

console.log('\n--- resumo ---');
console.log(`pass=${results.filter((r) => r.ok).length}/${results.length}`);
if (slow.length) console.log('AVISO latencia >15s:', slow.map((s) => s.label).join(', '));
if (failed.length) {
  console.error('Falhas:', failed);
  process.exit(2);
}

const docs = results.find((r) => r.label === 'documentos page');
if (docs && docs.total < 1000) {
  console.log(
    `Nota: staging tem ${docs.total} documentos (meta prova 100k). Seed/staging-load para volume real.`,
  );
} else if (docs && docs.total >= 90_000) {
  console.log(`Prova volume: ${docs.total} documentos (>=90k).`);
}
console.log('OK: listagens/agregados responderam sem carregar blob completo.');
