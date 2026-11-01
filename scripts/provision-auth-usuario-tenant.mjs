/**
 * Provisiona Supabase Auth + auth_user_id para um utilizador ISO PRO sem ligação JWT.
 *
 * Uso (PowerShell):
 *   $env:ISO_PRO_ALIGN_PASSWORD = 'sua-senha'
 *   node scripts/provision-auth-usuario-tenant.mjs --tenant-slug=nova-empresa --login=admin
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL no .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const out = { ...process.env };
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (out[k] == null || out[k] === '') out[k] = v;
  }
  return out;
}

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : fallback;
}

const env = loadEnv();
const url = String(env.VITE_SUPABASE_URL ?? '').trim();
const serviceKey = String(
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.ISO_PRO_SUPABASE_SERVICE_ROLE_KEY ?? '',
).trim();
const password = String(env.ISO_PRO_ALIGN_PASSWORD ?? '').trim();
const tenantSlug = arg('tenant-slug', 'nova-empresa');
const login = arg('login', 'admin').toLowerCase();

if (!url || !serviceKey) {
  console.error('Falta VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
if (!password) {
  console.error('Defina ISO_PRO_ALIGN_PASSWORD com a senha do admin (igual à que usa no login).');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: tenant, error: tErr } = await admin
  .from('iso_pro_tenants')
  .select('id,slug,name')
  .eq('slug', tenantSlug)
  .maybeSingle();

if (tErr || !tenant) {
  console.error('Tenant nao encontrado:', tErr?.message ?? tenantSlug);
  process.exit(1);
}

const { data: user, error: uErr } = await admin
  .from('usuarios_sistema')
  .select('id,login,auth_user_id,tenant_id')
  .eq('tenant_id', tenant.id)
  .eq('login', login)
  .maybeSingle();

if (uErr || !user) {
  console.error('Utilizador nao encontrado:', uErr?.message ?? `${login}@${tenantSlug}`);
  process.exit(1);
}

if (user.auth_user_id) {
  console.log('Ja tem auth_user_id:', user.auth_user_id);
  process.exit(0);
}

const authEmail = `${login}+${tenant.slug}@isopro.local`;
const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
  email: authEmail,
  password,
  email_confirm: true,
  user_metadata: { iso_pro_login: login, tenant_id: tenant.id, tenant_slug: tenant.slug },
});

if (authErr || !authCreated.user?.id) {
  console.error('Falha createUser:', authErr?.message ?? 'sem id');
  process.exit(1);
}

const authUserId = authCreated.user.id;
const { error: linkErr } = await admin
  .from('usuarios_sistema')
  .update({ auth_user_id: authUserId })
  .eq('id', user.id)
  .eq('tenant_id', tenant.id);

if (linkErr) {
  console.error('Auth criado, mas falhou ligar auth_user_id:', linkErr.message);
  console.error('auth_user_id:', authUserId);
  process.exit(1);
}

console.log('OK — Auth ligado.');
console.log('tenant:', tenant.name, `(${tenant.slug})`);
console.log('login:', login);
console.log('auth_email:', authEmail);
console.log('auth_user_id:', authUserId);
