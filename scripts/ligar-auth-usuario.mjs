/**
 * Liga auth_user_id + membership para um utilizador rpc_only (admin ops).
 * Uso: node scripts/ligar-auth-usuario.mjs --login enzog --auth-user-id <uuid>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const out = {};
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return String(process.argv[i + 1] ?? '').trim();
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.ISO_PRO_SERVICE_ROLE_KEY;
const tenantId = env.VITE_ISO_PRO_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const login = arg('--login', 'enzog').toLowerCase();
const authUserId = arg('--auth-user-id', '');

if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL ou SERVICE_ROLE no .env');
  process.exit(2);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId)) {
  console.error('Passe --auth-user-id com UUID completo (36 caracteres).');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const auth = await admin.auth.admin.getUserById(authUserId);
if (auth.error || !auth.data?.user) {
  console.error('Auth user nao encontrado:', auth.error?.message ?? 'sem user');
  process.exit(1);
}
console.log('Auth OK:', auth.data.user.email);

const { data: users, error: uErr } = await admin
  .from('usuarios_sistema')
  .select('id,login,auth_user_id,ativo,tenant_id')
  .eq('tenant_id', tenantId)
  .ilike('login', login)
  .limit(5);

if (uErr) {
  console.error('usuarios_sistema:', uErr.message);
  process.exit(1);
}
if (!users?.length) {
  console.error('Login nao encontrado em usuarios_sistema:', login);
  process.exit(1);
}
const u = users[0];
console.log('Usuario ISO:', u.id, u.login, 'auth_antes=', u.auth_user_id ?? '(null)');

const { error: upErr } = await admin
  .from('usuarios_sistema')
  .update({ auth_user_id: authUserId })
  .eq('id', u.id)
  .eq('tenant_id', tenantId);

if (upErr) {
  console.error('Update auth_user_id falhou:', upErr.message);
  process.exit(1);
}

const { error: mErr } = await admin.from('iso_pro_auth_membership').upsert(
  {
    auth_user_id: authUserId,
    tenant_id: tenantId,
  },
  { onConflict: 'auth_user_id,tenant_id' },
);

if (mErr) {
  console.warn('Membership upsert aviso:', mErr.message);
}

console.log('OK: ligado', login, '→', authUserId);
console.log('Peça ao utilizador para entrar de novo (senha ISO = senha Auth).');
