/**
 * Valida piloto JWT end-to-end (Auth signIn + RPC auditoria).
 * Senha: ISO_PRO_PILOTO_SENHA (mesma do admin I.S.O PRO).
 */
// Ambiente local Windows: alguns PCs falham verificacao TLS em Node (fetch failed).
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenant = '00000000-0000-0000-0000-000000000001';

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

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const senha = String(process.env.ISO_PRO_PILOTO_SENHA ?? '').trim();
const email = String(process.env.ISO_PRO_PILOTO_EMAIL ?? 'admin@isopro.local').trim();

if (!url || !anon) {
  console.error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}
if (!senha) {
  console.error('Defina ISO_PRO_PILOTO_SENHA.');
  process.exit(1);
}

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('=== Validacao piloto JWT ===');

const resolver = await supabase.rpc('iso_pro_resolver_auth_email_sessao', {
  p_tenant_id: tenant,
  p_login: 'admin',
  p_senha: senha,
});
if (resolver.error || resolver.data?.ok !== true) {
  console.error('Resolver falhou:', resolver.error?.message ?? resolver.data);
  process.exit(1);
}
console.log('1/3 Resolver OK:', resolver.data.email, resolver.data.authUserId);

const signIn = await supabase.auth.signInWithPassword({ email, password: senha });
if (signIn.error || !signIn.data.session) {
  console.error('2/3 SignIn falhou:', signIn.error?.message ?? 'sem sessao');
  process.exit(1);
}
console.log('2/3 SignIn OK — role authenticated, user', signIn.data.user.id);

const tokenParts = signIn.data.session.access_token.split('.');
if (tokenParts.length >= 2) {
  const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8'));
  console.log('JWT claims (tenant_id):', payload.tenant_id ?? payload.app_metadata?.tenant_id ?? '(ausente)');
}

const audit = await supabase.rpc('iso_pro_auditar_rls_jwt_estado', { p_tenant_id: tenant });
if (audit.error) {
  console.error('3/3 Auditoria RPC erro:', audit.error.message);
  process.exit(1);
}
const body = audit.data ?? {};
console.log('3/3 Auditoria:', JSON.stringify(body, null, 2));

const modo = String(body.modo ?? '');
const jwtAtivo = body.jwtAtivo === true;
const jwtAlinhado = body.jwtAlinhado === true;

const ok = modo === 'jwt_forte' && jwtAtivo === true && jwtAlinhado === true;
if (!ok) {
  console.error('Esperado modo jwt_forte com jwtAtivo/jwtAlinhado true.');
  process.exit(1);
}

console.log('');
console.log('=== PILOTO JWT OK (jwt_forte) ===');
console.log('Proximo: teste mobile 1.0.44 — 10+ baixas + auditoria Dispositivos mobile.');
