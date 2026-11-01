/**
 * Probe read-only: imprime erros RPC sem secrets (auditoria).
 * Uso: node scripts/run-load-on-staging.mjs -- scripts/audit-staging-probe.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const tenant =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: base, error: e1 } = await sb
  .from('iso_pro_snapshot')
  .select('updated_at')
  .eq('id', 'default')
  .eq('tenant_id', tenant)
  .maybeSingle();
console.log('snapshot_read:', e1 ? e1.message : 'ok', base?.updated_at ? 'has_baseline' : 'no_baseline');

const { error: e2 } = await sb.rpc('iso_pro_list_documentos_planejamento_page', {
  p_tenant_id: tenant,
  p_busca: null,
  p_offset: 0,
  p_limit: 5,
  p_status: 'todos',
});
console.log('list_docs:', e2 ? e2.message : 'ok');

const { error: e2b } = await sb.rpc('iso_pro_list_materiais_page', {
  p_tenant_id: tenant,
  p_busca: null,
  p_offset: 0,
  p_limit: 5,
  p_disciplina: null,
  p_ativo: null,
});
console.log('list_materiais:', e2b ? e2b.message : 'ok');

const { error: e2c } = await sb.rpc('iso_pro_escala_outbox_status', { p_tenant_id: tenant });
console.log('outbox_status:', e2c ? e2c.message : 'ok');

const { error: e3 } = await sb.rpc('iso_pro_submit_atendimento_comando', {
  p_tenant_id: tenant,
  p_idempotency_key: `audit-probe-${Date.now()}`,
  p_baseline: base?.updated_at ?? null,
  p_historico_novas: [],
});
console.log('submit_comando:', e3 ? e3.message : 'ok');
