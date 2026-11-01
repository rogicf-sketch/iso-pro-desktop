/**
 * Bootstrap user E2E no staging-load (nunca LIVE).
 * Cria perfil operação + utilizador `e2e` + Auth + liga auth_user_id;
 * grava ISO_PRO_E2E_* em .env.staging.
 *
 *   node --use-system-ca scripts/bootstrap-e2e-staging-user.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertLoadTestStagingOnly } from './load-test-staging-guard.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = '00000000-0000-0000-0000-000000000001';
const LOGIN = 'e2e';
const PERFIL_CODIGO = 'operacao'; // evita MFA obrigatório de admin

function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function upsertEnvKey(filePath, key, value) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text.trimEnd()}\n\n# E2E Playwright (staging-load)\n${line}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
}

const staging = loadEnvFile('.env.staging');
for (const [k, v] of Object.entries(staging)) {
  if (!process.env[k]) process.env[k] = v;
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ISO_PRO_SERVICE_ROLE_KEY;
assertLoadTestStagingOnly(url);
if (!url || !serviceKey) {
  console.error('Falta VITE_SUPABASE_URL / SERVICE_ROLE em .env.staging');
  process.exit(1);
}

const password =
  process.env.ISO_PRO_E2E_SENHA?.trim() ||
  staging.ISO_PRO_E2E_SENHA?.trim() ||
  `E2e-${crypto.randomBytes(9).toString('base64url')}!`;

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MODULOS = [
  'documentos',
  'recebimentos',
  'materiais',
  'atendimento',
  'qualidade',
  'rir',
  'rnc',
  'relatorios',
  'inventario',
  'configuracoes',
  'painel',
  'operacao',
  'mobile', // login Campo (p_requer_modulo)
];
const ACOES = ['visualizar', 'criar', 'editar', 'eliminar', 'exportar', 'imprimir'];

console.log('Bootstrap E2E staging-load…');

// Perfil operação (sem MFA obrigatório de admin)
let perfilId;
{
  const { data: existing } = await sb
    .from('perfis_acesso')
    .select('id')
    .eq('tenant_id', TENANT)
    .eq('codigo', PERFIL_CODIGO)
    .maybeSingle();
  if (existing?.id) {
    perfilId = existing.id;
  } else {
    const { data, error } = await sb
      .from('perfis_acesso')
      .insert({ tenant_id: TENANT, codigo: PERFIL_CODIGO, nome: 'Operação' })
      .select('id')
      .single();
    if (error) {
      console.error('perfil:', error.message);
      process.exit(1);
    }
    perfilId = data.id;
  }
}

// Permissões do perfil (idempotente: delete+insert para admin e2e)
{
  await sb.from('perfil_permissoes').delete().eq('tenant_id', TENANT).eq('perfil_id', perfilId);
  const rows = [];
  for (const modulo of MODULOS) {
    for (const acao of ACOES) {
      rows.push({
        tenant_id: TENANT,
        perfil_id: perfilId,
        modulo,
        acao,
        permitido: true,
      });
    }
  }
  const { error } = await sb.from('perfil_permissoes').insert(rows);
  if (error) {
    console.error('perfil_permissoes:', error.message);
    process.exit(1);
  }
}

// Utilizador e2e
let userId;
let authUserId = null;
{
  const { data: existing } = await sb
    .from('usuarios_sistema')
    .select('id,auth_user_id')
    .eq('tenant_id', TENANT)
    .eq('login', LOGIN)
    .maybeSingle();
  if (existing?.id) {
    userId = existing.id;
    authUserId = existing.auth_user_id ?? null;
    const { error } = await sb
      .from('usuarios_sistema')
      .update({
        senha: password,
        ativo: true,
        perfil_id: perfilId,
        nome: 'E2E Playwright',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      console.error('update user:', error.message);
      process.exit(1);
    }
  } else {
    const { data, error } = await sb
      .from('usuarios_sistema')
      .insert({
        tenant_id: TENANT,
        login: LOGIN,
        nome: 'E2E Playwright',
        senha: password,
        perfil_id: perfilId,
        ativo: true,
      })
      .select('id,auth_user_id')
      .single();
    if (error) {
      console.error('insert user:', error.message);
      process.exit(1);
    }
    userId = data.id;
    authUserId = data.auth_user_id ?? null;
  }
}

const authEmail = `${LOGIN}+default@isopro.local`;
if (!authUserId) {
  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      iso_pro_login: LOGIN,
      tenant_id: TENANT,
      tenant_slug: 'default',
    },
  });
  if (authErr || !created.user?.id) {
    // talvez já exista — tenta listar por email
    const { data: listed } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const hit = listed?.users?.find((u) => u.email === authEmail);
    if (!hit?.id) {
      console.error('createUser:', authErr?.message ?? 'sem id');
      process.exit(1);
    }
    authUserId = hit.id;
    await sb.auth.admin.updateUserById(authUserId, { password });
  } else {
    authUserId = created.user.id;
  }
  const { error: linkErr } = await sb
    .from('usuarios_sistema')
    .update({ auth_user_id: authUserId })
    .eq('id', userId);
  if (linkErr) {
    console.error('link auth_user_id:', linkErr.message);
    process.exit(1);
  }
} else {
  await sb.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
}

// Remove factores MFA residuais (enroll parcial de corrida anterior como admin)
try {
  const { data: factors } = await sb.auth.admin.mfa.listFactors({ userId: authUserId });
  const all = [...(factors?.totp ?? []), ...(factors?.phone ?? [])];
  for (const f of all) {
    if (!f?.id) continue;
    await sb.auth.admin.mfa.deleteFactor({ userId: authUserId, id: f.id });
  }
} catch (e) {
  console.warn('mfa cleanup aviso:', e instanceof Error ? e.message : String(e));
}

// Membership (PK = auth_user_id)
{
  const { error } = await sb.from('iso_pro_auth_membership').upsert({
    auth_user_id: authUserId,
    tenant_id: TENANT,
    usuario_sistema_id: String(userId),
  });
  if (error && !/does not exist|PGRST/i.test(error.message)) {
    console.warn('membership aviso:', error.message);
  }
}

// Smoke resolver
{
  const { data, error } = await sb.rpc('iso_pro_resolver_auth_email_sessao', {
    p_tenant_id: TENANT,
    p_login: LOGIN,
    p_senha: password,
  });
  if (error || !data?.ok || !data?.jwtReady) {
    console.error('resolver falhou:', error?.message ?? JSON.stringify(data));
    process.exit(1);
  }
  console.log('resolver OK jwtReady=true');
}

const envPath = path.join(root, '.env.staging');
upsertEnvKey(envPath, 'ISO_PRO_E2E_LOGIN', LOGIN);
upsertEnvKey(envPath, 'ISO_PRO_E2E_SENHA', password);
upsertEnvKey(envPath, 'ISO_PRO_E2E_TENANT_ID', TENANT);
upsertEnvKey(envPath, 'VITE_ISO_PRO_TENANT_ID', TENANT);
upsertEnvKey(envPath, 'SUPABASE_TENANT_ID', TENANT);

console.log('OK — user e2e provisionado; credenciais escritas em .env.staging');
console.log(`login=${LOGIN} tenant=${TENANT} auth_email=${authEmail}`);
