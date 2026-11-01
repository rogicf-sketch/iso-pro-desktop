/**
 * Burst de leituras paralelas (documentos / materiais / outbox) — staging ou prod.
 * Uso: ISO_PRO_SMOKE_STAGING=1 node scripts/load-test-listagens-burst.mjs --parallel 40
 */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const preferStaging = process.env.ISO_PRO_SMOKE_STAGING === '1';
const files = preferStaging ? ['.env.staging', '.env'] : ['.env', '.env.staging'];
const env = { ...process.env };
for (const name of files) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (preferStaging && name === '.env.staging') env[k] = v;
    else if (env[k] === undefined || env[k] === '') env[k] = v;
  }
}

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PARALLEL = Number(arg('--parallel', '40'));
const TENANT = env.SUPABASE_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Falta URL/ANON');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    await fn();
    return { label, ok: true, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      label,
      ok: false,
      ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function oneCycle(i) {
  const results = await Promise.all([
    timed('documentos', async () => {
      // p_status explícito evita ambiguidade PostgREST entre overloads 4 e 5 args.
      const { error } = await sb.rpc('iso_pro_list_documentos_planejamento_page', {
        p_tenant_id: TENANT,
        p_busca: null,
        p_offset: 0,
        p_limit: 20,
        p_status: 'todos',
      });
      if (error) throw new Error(error.message);
    }),
    timed('materiais', async () => {
      const { error } = await sb.rpc('iso_pro_list_materiais_page', {
        p_tenant_id: TENANT,
        p_busca: null,
        p_offset: 0,
        p_limit: 20,
        p_disciplina: null,
        p_ativo: null,
      });
      if (error) throw new Error(error.message);
    }),
    timed('outbox', async () => {
      const { error } = await sb.rpc('iso_pro_escala_outbox_status', { p_tenant_id: TENANT });
      if (error) throw new Error(error.message);
    }),
  ]);
  return { i, results };
}

console.log(`Listagens burst: parallel=${PARALLEL} host=${new URL(url).hostname}`);
const tAll = performance.now();
const cycles = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => oneCycle(i)));
const wall = Math.round(performance.now() - tAll);

const byLabel = { documentos: [], materiais: [], outbox: [] };
let errors = 0;
for (const c of cycles) {
  for (const r of c.results) {
    byLabel[r.label].push(r);
    if (!r.ok) errors += 1;
  }
}

for (const [label, rows] of Object.entries(byLabel)) {
  const ok = rows.filter((r) => r.ok);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  const firstErr = rows.find((r) => !r.ok)?.error;
  console.log(
    `${label}: ok=${ok.length}/${rows.length} p50=${pct(ms, 0.5)}ms p95=${pct(ms, 0.95)}ms max=${pct(ms, 1)}ms`,
  );
  if (firstErr) console.log(`  first_error: ${firstErr}`);
}
console.log(`wall=${wall}ms errors=${errors}`);
process.exit(errors === 0 ? 0 : 1);
