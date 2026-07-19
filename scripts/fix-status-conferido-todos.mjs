/** Alinha status='conferido' em TODOS os recebimentos com statusConferencia='conferido' e re-sincroniza escala. */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

const { data: snap, error: e1 } = await sb
  .from('iso_pro_snapshot')
  .select('payload, updated_at')
  .eq('id', 'default')
  .eq('tenant_id', T)
  .maybeSingle();
if (e1) throw new Error(e1.message);
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
const recs = pl.recebimentos ?? [];
console.log('total recebimentos na nuvem:', recs.length);

const desalinhados = recs.filter(
  (r) => String(r.statusConferencia ?? '') === 'conferido' && String(r.status ?? '') !== 'conferido',
);
console.log('desalinhados (conferido no mobile, status antigo):', desalinhados.length);
for (const r of desalinhados) {
  console.log(' -', r.nota ?? r.notaFiscal, '|', r.romaneio ?? '', '| status', r.status, '-> conferido');
  r.status = 'conferido';
}

if (desalinhados.length > 0) {
  const { error: e2 } = await sb.rpc('iso_pro_patch_snapshot', {
    p_tenant_id: T,
    p_baseline: snap.updated_at,
    p_patch: { recebimentos: desalinhados, dataAtualizacao: new Date().toISOString() },
    p_merge_keys: ['recebimentos'],
  });
  if (e2) throw new Error('patch: ' + e2.message);
  console.log('snapshot corrigido.');
  const { data: sync, error: e3 } = await sb.rpc('iso_pro_sync_recebimentos_from_snapshot', { p_tenant_id: T });
  console.log('sync escala:', e3 ? 'ERR ' + e3.message : JSON.stringify(sync));
}

const { data: page } = await sb.rpc('iso_pro_list_recebimentos_page', {
  p_tenant_id: T, p_busca: null, p_offset: 0, p_limit: 200, p_status: null, p_modo: 'aguardando_conferencia',
});
const pend = (page?.recebimentos ?? []).filter((r) => String(r.status) !== 'conferido');
console.log('pendentes de conferência agora:', pend.length, 'de', page?.total, 'no modo aguardando_conferencia');
for (const r of pend) console.log(' *', r.notaFiscal, '|', r.romaneio, '|', r.fornecedor, '|', r.status);
