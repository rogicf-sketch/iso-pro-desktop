/**
 * Heal status lista (parcial/pendente → derivado alinhado ao detalhe).
 * Uso: node scripts/heal-status-planejamento.mjs
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou ANON) + TENANT_ID
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv() {
  const out = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in out) || !out[k]) out[k] = v;
    }
  }
  return out;
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const tenant =
  env.VITE_ISO_PRO_TENANT_ID ||
  env.SUPABASE_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

if (!url || !key) {
  console.error('Faltam SUPABASE_URL / KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
let total = 0;
for (let i = 0; i < 80; i++) {
  const { data, error } = await sb.rpc('iso_pro_heal_status_documentos_planejamento', {
    p_tenant_id: tenant,
    p_limit: 200,
  });
  if (error) {
    console.error('ERR', error);
    process.exit(1);
  }
  const n = Number(data?.atualizados || 0);
  total += n;
  console.log(`lote ${i + 1}:`, data);
  if (n === 0) break;
}
console.log('TOTAL atualizados', total);
