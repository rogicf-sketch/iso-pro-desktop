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
if (e1) console.log('snapshot err:', e1.message);
const pl = typeof snap?.payload === 'string' ? JSON.parse(snap.payload) : (snap?.payload ?? {});
const recs = pl.recebimentos ?? [];
console.log('snapshot updated_at:', snap?.updated_at);
console.log('snapshot recebimentos:', recs.length);
for (const r of recs.slice(0, 10)) {
  console.log(' -', r.id, r.nota ?? r.notaFiscal, r.fornecedorNome ?? r.fornecedor, r.modoRecebimento, r.statusConferencia ?? '');
}

const { count, error: e2 } = await sb
  .from('iso_pro_recebimentos')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', T);
console.log('tabela iso_pro_recebimentos:', e2 ? 'err ' + e2.message : count);

const { data: page, error: e3 } = await sb.rpc('iso_pro_list_recebimentos_page', {
  p_tenant_id: T, p_busca: null, p_offset: 0, p_limit: 5, p_status: null, p_modo: null,
});
console.log('rpc list total:', e3 ? 'err ' + e3.message : page?.total, '_source:', page?._source);
