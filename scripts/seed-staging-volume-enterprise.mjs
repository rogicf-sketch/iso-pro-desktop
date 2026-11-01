/**
 * Seed enterprise no staging-load (nunca LIVE):
 *  - docs até --docs (default 200000; continua a partir dos 100k existentes)
 *  - recebimentos --recs (default 100000)
 *  - materiais via SQL separado (50k)
 *  - refresh iso_pro_tenant_contagens
 *
 * Pré-req:
 *   - iso_pro_seed_load100k_batch
 *   - iso_pro_seed_load_ent_recebimentos_batch (seed-staging-volume-enterprise-fn.sql)
 *   - migration 20260903010000 (contagens + lista/métricas)
 *
 *   node --use-system-ca scripts/seed-staging-volume-enterprise.mjs
 *   node --use-system-ca scripts/seed-staging-volume-enterprise.mjs --docs 200000 --recs 100000
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
const DOCS = Number(arg('--docs', '200000'));
const RECS = Number(arg('--recs', '100000'));
const BATCH = Number(arg('--batch', '2000'));
const ITENS = Number(arg('--itens', '4'));
const ITENS_NF = Number(arg('--itens-nf', '3'));
const MATS = Number(arg('--mats', '50000'));

const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`Seed enterprise → ${url}`);
console.log(
  `docs=${DOCS} recs=${RECS} batch=${BATCH} itens/doc=${ITENS} itens/nf=${ITENS_NF} mats=${MATS} tenant=${tenant}`,
);

async function seedDocs() {
  let docs = 0;
  let itens = 0;
  const t0 = Date.now();
  for (let from = 1; from <= DOCS; from += BATCH) {
    const to = Math.min(from + BATCH - 1, DOCS);
    const { data, error } = await sb.rpc('iso_pro_seed_load100k_batch', {
      p_tenant_id: tenant,
      p_from: from,
      p_to: to,
      p_itens_por_doc: ITENS,
      p_mats: MATS,
    });
    if (error) {
      console.error(`FAIL docs ${from}-${to}:`, error.message);
      process.exit(1);
    }
    docs += Number(data?.docs_inserted) || 0;
    itens += Number(data?.itens_inserted) || 0;
    if (from === 1 || to % 20000 === 0 || to === DOCS) {
      console.log(
        `docs ${from}-${to}: +${data?.docs_inserted} | acum +${docs} docs +${itens} itens | ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    }
  }
  return { docs, itens };
}

async function seedRecs() {
  {
    const { error } = await sb.rpc('iso_pro_seed_load_ent_recebimentos_batch', {
      p_tenant_id: tenant,
      p_from: 1,
      p_to: 1,
      p_itens_por_nf: 1,
      p_mats: MATS,
    });
    if (error && /could not find the function|PGRST202/i.test(error.message)) {
      console.error(
        'RPC iso_pro_seed_load_ent_recebimentos_batch ausente. Aplica scripts/seed-staging-volume-enterprise-fn.sql no staging.',
      );
      process.exit(1);
    }
  }
  let recs = 0;
  let itens = 0;
  const t0 = Date.now();
  for (let from = 1; from <= RECS; from += BATCH) {
    const to = Math.min(from + BATCH - 1, RECS);
    const { data, error } = await sb.rpc('iso_pro_seed_load_ent_recebimentos_batch', {
      p_tenant_id: tenant,
      p_from: from,
      p_to: to,
      p_itens_por_nf: ITENS_NF,
      p_mats: MATS,
    });
    if (error) {
      console.error(`FAIL recs ${from}-${to}:`, error.message);
      process.exit(1);
    }
    recs += Number(data?.recebimentos_inserted) || 0;
    itens += Number(data?.itens_inserted) || 0;
    if (from === 1 || to % 20000 === 0 || to === RECS) {
      console.log(
        `recs ${from}-${to}: +${data?.recebimentos_inserted} | acum +${recs} NFs +${itens} itens | ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
    }
  }
  return { recs, itens };
}

const tAll = Date.now();
const d = await seedDocs();
const r = await seedRecs();

{
  const { data, error } = await sb.rpc('iso_pro_refresh_tenant_contagens', {
    p_tenant_id: tenant,
  });
  if (error) {
    console.warn('Aviso refresh contagens:', error.message);
  } else {
    console.log('Contagens:', JSON.stringify(data));
  }
}

{
  const { data: page, error: pageErr } = await sb.rpc('iso_pro_list_documentos_planejamento_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 1,
    p_status: 'todos',
  });
  if (pageErr) console.warn('Lista docs:', pageErr.message);
  else console.log(`Lista docs total=${page?.total} mode=${page?._totalMode}`);

  const { data: rpage, error: rErr } = await sb.rpc('iso_pro_list_recebimentos_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 1,
    p_status: null,
    p_modo: null,
  });
  if (rErr) console.warn('Lista recs:', rErr.message);
  else console.log(`Lista recebimentos total=${rpage?.total}`);
}

console.log(
  `DONE ${((Date.now() - tAll) / 1000).toFixed(1)}s — docs+${d.docs} recs+${r.recs} (idempotente se já existia)`,
);
