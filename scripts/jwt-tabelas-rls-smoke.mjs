/**
 * Smoke: anon NÃO lê/escreve tabelas sensíveis; resolver login (anon RPC) ainda funciona.
 *
 *   npm run jwt:tabelas-rls-smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TENANT = '0bc5de18-4301-48b5-880a-a35a8e0f0539';

function loadEnv() {
  const out = { ...process.env };
  for (const name of ['.env', '.env.staging']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      if (out[k] !== undefined && String(out[k]).length > 0) continue;
      out[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const tenant = String(env.ISO_PRO_SMOKE_TENANT_ID || DEFAULT_TENANT).trim();

console.log('=== jwt:tabelas-rls-smoke ===');
if (!url || !anonKey) {
  console.error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  process.exit(2);
}
console.log('host:', new URL(url).host);
console.log('tenant:', tenant);

const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

let failed = 0;

const tables = [
  'iso_pro_snapshot',
  'materiais',
  'usuarios_sistema',
  'iso_pro_rir',
  'iso_pro_rnc',
  'iso_pro_relatorio_snapshot',
];

for (const table of tables) {
  const { data, error, count } = await anon
    .from(table)
    .select('*', { count: 'exact', head: false })
    .eq('tenant_id', tenant)
    .limit(2);

  const rows = data?.length ?? 0;
  const n = count ?? rows;
  if (rows > 0 || (typeof count === 'number' && count > 0)) {
    console.error(`FALHA: anon LEU ${table} (rows=${rows} count=${n})`);
    failed += 1;
  } else if (error && /permission|rls|42501|not authorized/i.test(error.message)) {
    console.log(`ok: anon bloqueado em SELECT ${table} (${error.code || 'denied'})`);
  } else if (error) {
    // PostgREST pode devolver erro genérico ou vazio com 0 rows
    console.log(`ok: anon SELECT ${table} sem dados (${error.message.slice(0, 80)})`);
  } else {
    console.log(`ok: anon SELECT ${table} → 0 rows`);
  }
}

// INSERT deve falhar / 0 rows (não faz UPDATE amplo — evita corromper SoT no smoke).
{
  const ins = await anon.from('materiais').insert({
    tenant_id: tenant,
    codigo: `__SMOKE_ANON_${Date.now()}__`,
    descricao: 'smoke-anon-should-fail',
  }).select('id');
  if ((ins.data?.length ?? 0) > 0) {
    console.error('FALHA: anon INSERT materiais criou linha');
    failed += 1;
  } else if (ins.error && /permission|rls|42501|not authorized|violates row-level/i.test(ins.error.message)) {
    console.log(`ok: anon INSERT materiais bloqueado (${ins.error.code || 'denied'})`);
  } else {
    console.log(`ok: anon INSERT materiais sem efeito (${ins.error?.message?.slice(0, 80) || '0 rows'})`);
  }
}

// Bootstrap login RPC ainda para anon
{
  const { error } = await anon.rpc('iso_pro_resolver_auth_email_sessao', {
    p_tenant_id: tenant,
    p_login: '__smoke_nao_existe__',
    p_senha: 'x',
  });
  if (error && /could not find the function|PGRST202|permission denied|42501/i.test(error.message)) {
    console.error(`FALHA: resolver login inacessível ao anon: ${error.message}`);
    failed += 1;
  } else {
    console.log('ok: anon ainda executa iso_pro_resolver_auth_email_sessao (bootstrap)');
  }
}

// Peek continua (onda 2)
{
  const { error } = await anon.rpc('iso_pro_peek_atendimento_comando', {
    p_tenant_id: tenant,
    p_idempotency_key: `smoke-tabelas-${Date.now()}`,
  });
  if (error && /permission denied|42501|could not find the function/i.test(error.message)) {
    console.error(`FALHA: peek anon bloqueado: ${error.message}`);
    failed += 1;
  } else {
    console.log('ok: anon peek atendimento ainda permitido');
  }
}

if (failed > 0) {
  console.error(`\nresultado: FALHOU (${failed})`);
  process.exitCode = 1;
} else {
  console.log('\nresultado: OK — tabelas sensíveis fechadas ao anon');
}
