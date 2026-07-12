/**
 * Auditoria read-only: cobertura auth_user_id / membership (JWT PR1).
 *
 * Preferência: SUPABASE_SERVICE_ROLE_KEY no .env (nunca commitado).
 * Sem service role: imprime o SQL a correr no Dashboard.
 *
 * Uso: npm run jwt:auditar-link
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = '00000000-0000-0000-0000-000000000001';

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

const env = loadEnv();
const url = String(env.VITE_SUPABASE_URL ?? '').trim();
const serviceKey = String(
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.ISO_PRO_SUPABASE_SERVICE_ROLE_KEY ?? '',
).trim();

const snippetPath = path.join(root, 'supabase', 'snippets', 'auditar_auth_link_cobertura.sql');

console.log('=== Auditoria Auth link (cobertura JWT) ===');
console.log('Tenant:', TENANT);

if (!url || !serviceKey) {
  console.log('');
  console.log('Sem SUPABASE_SERVICE_ROLE_KEY no .env — modo instrucoes.');
  console.log('1) Abra SQL Editor no Supabase');
  console.log('2) Execute o ficheiro:');
  console.log('   ', snippetPath);
  console.log('3) Por cada linha rpc_only: criar Auth user (mesma senha) + Ligar no PC');
  console.log('   Ver CHECKLIST-ATIVACAO-JWT.md Fase 4');
  process.exit(0);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: users, error: usersErr } = await admin
  .from('usuarios_sistema')
  .select('id, login, nome, ativo, auth_user_id, perfil_id')
  .eq('tenant_id', TENANT)
  .eq('ativo', true)
  .order('login');

if (usersErr) {
  console.error('Falha ao ler usuarios_sistema:', usersErr.message);
  process.exit(1);
}

const rows = users ?? [];
const comAuth = rows.filter((u) => u.auth_user_id);
const semAuth = rows.filter((u) => !u.auth_user_id);

const { count: memberships, error: memErr } = await admin
  .from('iso_pro_auth_membership')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', TENANT);

if (memErr) {
  console.warn('Aviso membership count:', memErr.message);
}

console.log('');
console.log('Activos:', rows.length);
console.log('Com auth_user_id (jwt_ready):', comAuth.length);
console.log('Sem auth_user_id (rpc_only):', semAuth.length);
console.log('Memberships (tenant):', memberships ?? '(n/d)');
console.log('');

if (semAuth.length) {
  console.log('— Ainda rpc_only (ligar Auth) —');
  for (const u of semAuth) {
    console.log(`  ${u.login.padEnd(20)} id=${u.id}`);
  }
  console.log('');
  console.log('Passo seguinte por utilizador:');
  console.log('  Dashboard Auth → Add user (email) → mesma senha ISO PRO');
  console.log('  PC Utilizadores → Ligar Supabase Auth (UUID)');
  console.log('  Ou Edge iso_pro_link_auth_user (ver supabase/functions/README.md)');
} else {
  console.log('Todos os activos tem auth_user_id. Gate para cutover anon mais perto.');
}

console.log('');
console.log('Validar piloto: npm run jwt:validar-piloto (ISO_PRO_PILOTO_SENHA)');
