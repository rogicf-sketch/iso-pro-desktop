/** Alinha status='conferido' no recebimento conferido no mobile (NF-102345) e re-sincroniza escala. */
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

const alvo = recs.find(
  (r) => String(r.statusConferencia ?? '') === 'conferido' && String(r.status ?? '') !== 'conferido',
);
if (!alvo) {
  console.log('nada a corrigir — nenhum recebimento com statusConferencia=conferido e status desalinhado.');
  process.exit(0);
}
console.log('a corrigir:', alvo.id, alvo.nota ?? alvo.notaFiscal, '| status', alvo.status, '->', 'conferido');
alvo.status = 'conferido';

const { error: e2 } = await sb.rpc('iso_pro_patch_snapshot', {
  p_tenant_id: T,
  p_baseline: snap.updated_at,
  p_patch: { recebimentos: [alvo], dataAtualizacao: new Date().toISOString() },
  p_merge_keys: ['recebimentos'],
});
if (e2) throw new Error('patch: ' + e2.message);
console.log('snapshot corrigido (merge por id).');

const { data: sync, error: e3 } = await sb.rpc('iso_pro_sync_recebimentos_from_snapshot', { p_tenant_id: T });
console.log('sync escala:', e3 ? 'ERR ' + e3.message : JSON.stringify(sync));

const { data: page } = await sb.rpc('iso_pro_list_recebimentos_page', {
  p_tenant_id: T, p_busca: 'NF-102345', p_offset: 0, p_limit: 5, p_status: null, p_modo: null,
});
for (const r of page?.recebimentos ?? []) {
  console.log('verificação:', r.notaFiscal, '| status:', r.status, '| conferente:', r.conferente);
}
console.log('total geral:', page?.total);
