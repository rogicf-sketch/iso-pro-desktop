import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(label, (Date.now()-t0)+'ms', 'ok', typeof r === 'object' ? JSON.stringify(r)?.slice(0,120) : r);
    return r;
  } catch (e) {
    console.log(label, (Date.now()-t0)+'ms', 'ERR', e.message);
  }
}

await timed('stats', async () => {
  const { data, error } = await sb.rpc('iso_pro_snapshot_stats', { p_tenant_id: T });
  if (error) throw error;
  return data;
});

await timed('read_doc_by_numero', async () => {
  const { data, error } = await sb.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: T,
    p_documento_id: null,
    p_numero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
    p_revisao: null,
  });
  if (error) throw error;
  const d = data?.documento;
  return { id: d?.id, nItens: d?.itens?.length, qAt: d?.itens?.[0]?.quantidadeAtendida };
});

await timed('read_slices_light', async () => {
  const { data, error } = await sb.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: T,
    p_keys: ['atendimentos','atendimentoHistorico','atendimentoEstornoLog','configuracoesSistema'],
  });
  if (error) throw error;
  const keys = Object.keys(data?.slices ?? data ?? {});
  const hist = (data?.slices?.atendimentoHistorico ?? data?.atendimentoHistorico ?? [])?.length;
  const atd = (data?.slices?.atendimentos ?? data?.atendimentos ?? [])?.length;
  return { keys, atd, hist, bytes: JSON.stringify(data).length };
});

await timed('read_slices_docs_only_size', async () => {
  const { data, error } = await sb.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: T,
    p_keys: ['documentos'],
  });
  if (error) throw error;
  const docs = data?.slices?.documentos ?? data?.documentos ?? [];
  return { nDocs: docs.length, bytes: JSON.stringify(data).length };
});
