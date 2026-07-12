/**
 * Valida login admin via RPC (senha em ISO_PRO_PILOTO_SENHA — nunca commitar).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

function loadEnv() {
  const out = {};
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
const key = env.VITE_SUPABASE_ANON_KEY;
const senha = String(process.env.ISO_PRO_PILOTO_SENHA ?? '').trim();
const tenant = '00000000-0000-0000-0000-000000000001';

if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}
if (!senha) {
  console.error('Defina ISO_PRO_PILOTO_SENHA no ambiente.');
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/rpc/iso_pro_autenticar_usuario`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    p_tenant_id: tenant,
    p_login: 'admin',
    p_senha: senha,
    p_modulo: null,
  }),
});

const data = await res.json();
console.log(
  JSON.stringify(
    {
      http: res.status,
      ok: data?.ok === true,
      login: data?.user?.login ?? null,
      perfil: data?.user?.perfil?.nome ?? data?.user?.perfil?.id ?? null,
      error: data?.error ?? null,
    },
    null,
    2,
  ),
);
process.exit(data?.ok === true ? 0 : 1);
