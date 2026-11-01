/**
 * Seed ops enterprise (staging-load ONLY): atendimentos + RIR + RNC
 * sobre volume docs/NFs/materiais já existente.
 *
 *   node --use-system-ca scripts/seed-staging-volume-enterprise-ops.mjs
 *   node --use-system-ca scripts/seed-staging-volume-enterprise-ops.mjs --atd 50000 --rir 30000 --rnc 15000
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
const ATD = Number(arg('--atd', '50000'));
const RIR = Number(arg('--rir', '30000'));
const RNC = Number(arg('--rnc', '15000'));
const BATCH = Number(arg('--batch', '2000'));
const DOCS_MOD = Number(arg('--docs-mod', '200000'));
const RECS_MOD = Number(arg('--recs-mod', '100000'));
const MATS = Number(arg('--mats', '50000'));

const sb = createClient(url, key, { auth: { persistSession: false } });
console.log(`Seed ops enterprise → ${url}`);
console.log(`atd=${ATD} rir=${RIR} rnc=${RNC} batch=${BATCH} tenant=${tenant}`);

async function seedRpc(name, from, to, extra = {}) {
  const { data, error } = await sb.rpc(name, {
    p_tenant_id: tenant,
    p_from: from,
    p_to: to,
    ...extra,
  });
  if (error) throw new Error(`${name} ${from}-${to}: ${error.message}`);
  return data ?? {};
}

async function seedRange(label, name, target, extra = {}, insertedKey) {
  let inserted = 0;
  const t0 = Date.now();
  // probe
  try {
    await seedRpc(name, 1, 1, extra);
  } catch (e) {
    if (/could not find the function|PGRST202/i.test(String(e.message))) {
      console.error(`RPC ${name} ausente. Aplica scripts/seed-staging-volume-enterprise-ops-fn.sql`);
      process.exit(1);
    }
    throw e;
  }
  for (let from = 1; from <= target; from += BATCH) {
    const to = Math.min(from + BATCH - 1, target);
    const row = await seedRpc(name, from, to, extra);
    inserted += Number(row[insertedKey]) || 0;
    if (from === 1 || to % 10000 === 0 || to === target) {
      console.log(
        `${label} ${from}-${to}: +${row[insertedKey]} | acum +${inserted} | ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    }
  }
  return inserted;
}

const tAll = Date.now();
const a = await seedRange(
  'atd',
  'iso_pro_seed_load_ent_atendimento_batch',
  ATD,
  { p_itens_por_lote: 2, p_docs_mod: DOCS_MOD, p_mats: MATS },
  'lotes_inserted',
);
const r = await seedRange(
  'rir',
  'iso_pro_seed_load_ent_rir_batch',
  RIR,
  { p_recs_mod: RECS_MOD },
  'rir_inserted',
);
const n = await seedRange(
  'rnc',
  'iso_pro_seed_load_ent_rnc_batch',
  RNC,
  { p_recs_mod: RECS_MOD },
  'rnc_inserted',
);

{
  const { data, error } = await sb.rpc('iso_pro_refresh_tenant_contagens', { p_tenant_id: tenant });
  if (error) console.warn('refresh contagens:', error.message);
  else console.log('Contagens:', JSON.stringify(data));
}

console.log(
  `DONE ${((Date.now() - tAll) / 1000).toFixed(1)}s — atd+${a} rir+${r} rnc+${n} (idempotente)`,
);
