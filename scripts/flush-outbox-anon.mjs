/** Flush outbox com anon/publishable do .env (sem service role). */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = load(path.join(root, '.env'));
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const tenant = '00000000-0000-0000-0000-000000000001';
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const flush = await sb.rpc('iso_pro_flush_escala_outbox', { p_tenant_id: tenant, p_max: 8 });
console.log('flush', flush.error ? flush.error.message : JSON.stringify(flush.data));
const st = await sb.rpc('iso_pro_escala_outbox_status', { p_tenant_id: tenant });
console.log('status', st.error ? st.error.message : JSON.stringify(st.data));
