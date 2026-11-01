/**
 * Seed ~100k docs no staging-load via RPC em lotes (nunca LIVE).
 * Pré-req: função iso_pro_seed_load100k_batch + materiais LOAD100K-M-* no staging.
 *
 *   node --use-system-ca scripts/seed-staging-volume-100k.mjs
 *   node --use-system-ca scripts/seed-staging-volume-100k.mjs --target 100000 --batch 2000
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
const tenant =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

assertLoadTestStagingOnly(url);

if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SERVICE_ROLE (staging).');
  process.exit(1);
}

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const TARGET = Number(arg('--target', '100000'));
const BATCH = Number(arg('--batch', '2000'));
const ITENS = Number(arg('--itens', '4'));
const MATS = Number(arg('--mats', '20000'));

const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`Seed 100k → ${url}`);
console.log(`target=${TARGET} batch=${BATCH} itens/doc=${ITENS} mats=${MATS} tenant=${tenant}`);

{
  const { error } = await sb.rpc('iso_pro_seed_load100k_batch', {
    p_tenant_id: tenant,
    p_from: 1,
    p_to: 1,
    p_itens_por_doc: 1,
    p_mats: MATS,
  });
  if (error && /could not find the function|PGRST202/i.test(error.message)) {
    console.error(
      'RPC iso_pro_seed_load100k_batch ausente. Aplica scripts/seed-staging-volume-100k-fn.sql no staging.',
    );
    process.exit(1);
  }
}

let docs = 0;
let itens = 0;
const t0 = Date.now();

for (let from = 1; from <= TARGET; from += BATCH) {
  const to = Math.min(from + BATCH - 1, TARGET);
  const { data, error } = await sb.rpc('iso_pro_seed_load100k_batch', {
    p_tenant_id: tenant,
    p_from: from,
    p_to: to,
    p_itens_por_doc: ITENS,
    p_mats: MATS,
  });
  if (error) {
    console.error(`FAIL lote ${from}-${to}:`, error.message);
    process.exit(1);
  }
  const row = data ?? {};
  docs += Number(row.docs_inserted) || 0;
  itens += Number(row.itens_inserted) || 0;
  if (from === 1 || to % 10000 === 0 || to === TARGET) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `OK ${from}-${to}: +${row.docs_inserted} docs +${row.itens_inserted} itens | acum docs=${docs} itens=${itens} | ${elapsed}s`,
    );
  }
}

const { data: page, error: pageErr } = await sb.rpc('iso_pro_list_documentos_planejamento_page', {
  p_tenant_id: tenant,
  p_busca: null,
  p_offset: 0,
  p_limit: 1,
  p_status: 'todos',
});
if (pageErr) {
  console.warn('Aviso: nao consegui ler total da lista:', pageErr.message);
} else {
  console.log(`Lista RPC total=${page?.total ?? '?'}`);
}

console.log(
  `DONE em ${((Date.now() - t0) / 1000).toFixed(1)}s — inseridos nesta corrida: docs=${docs} itens=${itens}`,
);
