/**
 * Diagnostica colaboradores: tabela SoT vs array no snapshot.
 *   node --use-system-ca scripts/diagnostico-colaboradores.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.ISO_PRO_SERVICE_ROLE_KEY;
const tenant = env.VITE_ISO_PRO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
if (!url || !key) {
  console.error('Falta URL/SERVICE_ROLE');
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { count: tableCount, error: cErr } = await sb
  .from('iso_pro_colaboradores')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenant);
if (cErr) console.error('count tabela:', cErr.message);

const { data: snap, error: sErr } = await sb
  .from('iso_pro_snapshot')
  .select('payload')
  .eq('id', 'default')
  .eq('tenant_id', tenant)
  .maybeSingle();
if (sErr) console.error('snapshot:', sErr.message);

const arr = snap?.payload?.colaboradores;
const snapCount = Array.isArray(arr) ? arr.length : 0;
const sampleSnap = Array.isArray(arr) ? arr.slice(0, 3).map((x) => x?.nome) : [];
const { data: sampleTable } = await sb
  .from('iso_pro_colaboradores')
  .select('id,nome')
  .eq('tenant_id', tenant)
  .limit(5);

console.log(
  JSON.stringify(
    {
      tenant,
      tabela_iso_pro_colaboradores: tableCount,
      snapshot_colaboradores: snapCount,
      sample_tabela: sampleTable,
      sample_snapshot_nomes: sampleSnap,
    },
    null,
    2,
  ),
);

if ((tableCount ?? 0) < 50 && snapCount > (tableCount ?? 0)) {
  console.log('→ Tabela incompleta vs snapshot. A correr iso_pro_sync_colaboradores_from_snapshot…');
  const { data: sync, error: syncErr } = await sb.rpc('iso_pro_sync_colaboradores_from_snapshot', {
    p_tenant_id: tenant,
  });
  if (syncErr) {
    console.error('sync falhou:', syncErr.message);
    process.exit(1);
  }
  console.log('sync resultado:', sync);
  const { count: after } = await sb
    .from('iso_pro_colaboradores')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant);
  console.log('tabela depois:', after);
}
