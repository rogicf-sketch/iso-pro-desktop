/**
 * Smoke diário operacional (SRE) — leitura só, sem gravar dados de obra.
 *
 * Verifica:
 *  1) Supabase URL + anon key
 *  2) RPC lista documentos (pagina 1) — escala 11k
 *  3) RPC materiais page (se existir)
 *  4) RPC outbox status (se existir)
 *
 * Uso local:
 *   npm run ops:smoke-diario
 *
 * CI / cron: secrets VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * Exit 0 = OK; exit 1 = falha.
 */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = process.env.ISO_PRO_E2E_TENANT_ID?.trim() || '00000000-0000-0000-0000-000000000001';

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
      const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (out[k] === undefined || out[k] === '') out[k] = v;
    }
  }
  return out;
}

function isRpcMissing(message) {
  return /function .* does not exist|PGRST202|could not find the function/i.test(message || '');
}

const env = loadEnv();
const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '')
  .trim()
  .replace(/^["']|["']$/g, '');
const anon = String(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\s+/g, '');

const checks = [];
let failed = 0;

function pass(name, detail = '') {
  checks.push({ name, ok: true, detail });
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failed += 1;
  checks.push({ name, ok: false, detail });
  console.error(`FAIL ${name} — ${detail}`);
}

function warn(name, detail) {
  checks.push({ name, ok: true, warn: true, detail });
  console.warn(`WARN ${name} — ${detail}`);
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

console.log('=== I.S.O PRO — smoke diario ops ===');
console.log(`tenant: ${TENANT}`);

if (!url || !anon) {
  fail('env', 'Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

let host = '';
try {
  host = new URL(url).hostname;
} catch {
  fail('env_url', `VITE_SUPABASE_URL invalida: ${url}`);
  process.exit(1);
}

const jwt = decodeJwtPayload(anon);
const jwtRef = jwt && typeof jwt.ref === 'string' ? jwt.ref : null;
const jwtRole = jwt && typeof jwt.role === 'string' ? jwt.role : null;
const hostRef = host.replace(/\.supabase\.co$/i, '');

console.log(`host:   ${host}`);
console.log(`anon:   len=${anon.length} role=${jwtRole ?? '?'} ref=${jwtRef ?? '?'} prefix=${anon.slice(0, 6)}…`);

if (!anon.startsWith('eyJ')) {
  fail(
    'env_anon',
    'VITE_SUPABASE_ANON_KEY deve ser JWT legacy (eyJ...), nao sb_publishable_/sb_secret_',
  );
  process.exit(1);
}
if (jwtRole && jwtRole !== 'anon') {
  fail('env_anon', `Esperado role=anon, veio role=${jwtRole}`);
  process.exit(1);
}
if (jwtRef && hostRef && jwtRef !== hostRef) {
  fail(
    'env_mismatch',
    `URL host ref="${hostRef}" nao bate com JWT ref="${jwtRef}". Corrige VITE_SUPABASE_URL ou ANON_KEY.`,
  );
  process.exit(1);
}
pass('env_keys', `host/ref alinhados (${hostRef})`);

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1) Reachability
try {
  const t0 = Date.now();
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  pass('http_rest', `HTTP ${res.status} em ${Date.now() - t0}ms`);
} catch (err) {
  fail('http_rest', err instanceof Error ? err.message : String(err));
}

// 2) Documentos page (escala) — timeout 25s; se falhar por timeout, tenta RPC mais leve
{
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('iso_pro_list_documentos_planejamento_page', {
    p_tenant_id: TENANT,
    p_busca: null,
    p_offset: 0,
    p_limit: 5,
    p_status: null,
  });
  if (error) {
    if (isRpcMissing(error.message)) warn('documentos_page', `RPC ausente: ${error.message}`);
    else if (/timeout|canceling statement/i.test(error.message)) {
      warn('documentos_page', `timeout (${Date.now() - t0}ms) — aplicar migrations 20260711170000 + 20260711180000`);
      const { data: ativa, error: e2 } = await supabase.rpc('iso_pro_documentos_tabelas_ativas', {
        p_tenant_id: TENANT,
      });
      if (e2) fail('documentos_tabelas_ativas', e2.message);
      else pass('documentos_tabelas_ativas', `ativas=${ativa}`);
    } else fail('documentos_page', error.message);
  } else {
    const row = data && typeof data === 'object' ? data : {};
    const total = Number(row.total ?? 0);
    const n = Array.isArray(row.documentos) ? row.documentos.length : 0;
    pass('documentos_page', `total=${total} page=${n} source=${row._source ?? '?'} ${Date.now() - t0}ms`);
  }
}

// 3) Materiais page
{
  const { data, error } = await supabase.rpc('iso_pro_list_materiais_page', {
    p_tenant_id: TENANT,
    p_busca: null,
    p_offset: 0,
    p_limit: 5,
    p_disciplina: null,
    p_ativo: null,
  });
  if (error) {
    if (isRpcMissing(error.message)) warn('materiais_page', `RPC ausente: ${error.message}`);
    else fail('materiais_page', error.message);
  } else {
    const row = data && typeof data === 'object' ? data : {};
    const total = Number(row.total ?? 0);
    pass('materiais_page', `total=${total}`);
  }
}

// 4) Outbox status
{
  const { data, error } = await supabase.rpc('iso_pro_escala_outbox_status', {
    p_tenant_id: TENANT,
  });
  if (error) {
    if (isRpcMissing(error.message)) warn('outbox_status', `RPC ausente: ${error.message}`);
    else fail('outbox_status', error.message);
  } else {
    const row = data && typeof data === 'object' ? data : {};
    const failedJobs = Number(row.failed ?? 0);
    pass(
      'outbox_status',
      `pending=${row.pending ?? 0} processing=${row.processing ?? 0} failed=${failedJobs}`,
    );
    if (failedJobs > 20) {
      warn('outbox_failed_high', `${failedJobs} jobs failed — ver Painel Escala`);
    }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logDir = path.join(root, 'release');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `smoke-diario-${stamp}.json`);
fs.writeFileSync(
  logPath,
  JSON.stringify({ at: new Date().toISOString(), tenant: TENANT, url, failed, checks }, null, 2),
  'utf8',
);
console.log(`log: ${logPath}`);

if (failed > 0) {
  console.error(`=== FALHOU (${failed}) ===`);
  process.exit(1);
}
console.log('=== OK ===');
process.exit(0);
