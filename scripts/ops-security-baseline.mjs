/**
 * Ops one-shot: prune retencao + auditoria jwt_ready/rpc_only + probe ensure_pending.
 * Uso (local): node --use-system-ca scripts/ops-security-baseline.mjs
 * Lê service role de services/pdf-worker/pdf-worker.local.env (nao imprime secrets).
 */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function load(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const rootEnv = load(path.join(root, '.env'));
const worker = load(path.join(root, 'services/pdf-worker/pdf-worker.local.env'));
const url = rootEnv.VITE_SUPABASE_URL || 'https://huvktaxsosxrfpvdigxq.supabase.co';
const service = worker.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!service) {
  console.error('Sem SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('=== ops security baseline ===');

{
  const { data, error } = await supabase.rpc('iso_pro_prune_retencao_ops', { p_retain_days: 30 });
  if (error) console.log('prune ERR', error.message);
  else console.log('prune OK', JSON.stringify(data));
}

{
  const { data, error } = await supabase
    .from('usuarios_sistema')
    .select('login,auth_user_id,ativo')
    .eq('tenant_id', '00000000-0000-0000-0000-000000000001')
    .eq('ativo', true);
  if (error) console.log('users ERR', error.message);
  else {
    const rows = data || [];
    const ready = rows.filter((r) => r.auth_user_id);
    const only = rows.filter((r) => !r.auth_user_id);
    console.log(
      `activos=${rows.length} jwt_ready=${ready.length} rpc_only=${only.length}`,
    );
    if (only.length) console.log('rpc_only_logins=', only.map((r) => r.login).join(','));
  }
}

{
  const { error } = await supabase.rpc('iso_pro_escala_outbox_ensure_pending', {
    p_tenant_id: '00000000-0000-0000-0000-000000000001',
    p_domain: 'documentos',
    p_reason: 'probe_migration',
  });
  console.log('ensure_pending', error ? error.message : 'OK');
}

{
  const { data, error } = await supabase.rpc('iso_pro_escala_outbox_status', {
    p_tenant_id: '00000000-0000-0000-0000-000000000001',
  });
  console.log('outbox', error ? error.message : JSON.stringify(data));
}

console.log('=== fim ===');
