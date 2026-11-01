/**
 * Verifica se utilizadores Auth @isopro.local / admin têm MFA TOTP verificado.
 * Usa service role do .env — só imprime contagens (sem segredos).
 *
 *   node scripts/verificar-mfa-admin.mjs
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

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.ISO_PRO_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY / ISO_PRO_SERVICE_ROLE_KEY.');
  process.exit(2);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) {
  console.error('listUsers:', error.message);
  process.exit(1);
}

const targets = (data?.users ?? []).filter((u) => {
  const email = String(u.email || '').toLowerCase();
  const meta = u.app_metadata || u.user_metadata || {};
  const roleHint = String(meta.role || meta.perfil || meta.login || '').toLowerCase();
  return (
    email.includes('admin') ||
    email.endsWith('@isopro.local') ||
    roleHint.includes('admin') ||
    String(u.email || '').toLowerCase().startsWith('admin@')
  );
});

console.log('=== MFA admin / @isopro.local / role admin ===');
console.log(`Candidatos: ${targets.length} (alargue filtro se faltar admin de tenant)`);
if (!targets.length) {
  console.log('Nenhum utilizador Auth correspondente.');
  process.exit(1);
}

let ok = 0;
for (const u of targets) {
  const detailed = await admin.auth.admin.getUserById(u.id);
  const factors = detailed.data?.user?.factors ?? u.factors ?? [];
  const verified = factors.filter(
    (f) => f.status === 'verified' && (f.factor_type === 'totp' || f.factor_type === 'phone'),
  );
  const line = {
    email: u.email,
    mfa_verified: verified.length,
    factor_types: verified.map((f) => f.factor_type),
  };
  console.log(JSON.stringify(line));
  if (verified.length > 0) ok += 1;
}

if (ok === 0) {
  console.error('Nenhum MFA verificado. Corra: npm run jwt:ativar-mfa-piloto (ISO_PRO_PILOTO_SENHA).');
  process.exit(1);
}
console.log(`OK: ${ok}/${targets.length} com MFA verificado.`);
