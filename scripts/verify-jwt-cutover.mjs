/** Verifica cutover: anon nao pode chamar iso_pro_autenticar_usuario. */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const preferStaging = process.env.ISO_PRO_SMOKE_STAGING === '1';
const file = preferStaging ? '.env.staging' : '.env';
const env = {};
for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
}
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await sb.rpc('iso_pro_autenticar_usuario', {
  p_tenant_id: '00000000-0000-0000-0000-000000000001',
  p_login: 'admin',
  p_senha: 'x',
  p_requer_modulo: null,
});
if (error && /permission denied|not granted|42501/i.test(error.message)) {
  console.log('OK cutover — anon bloqueado:', error.message);
  process.exit(0);
}
console.error('FALHA cutover — esperado permission denied, veio:', error?.message ?? 'sem erro');
process.exit(1);
