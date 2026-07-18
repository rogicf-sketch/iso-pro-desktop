// Onde o estorno MULTIPLOS gasta tempo: cada leitura do fluxo, medida com dados reais.
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
    console.log(String(label).padEnd(38), String(Date.now() - t0).padStart(6) + 'ms', typeof r === 'string' ? r : JSON.stringify(r).slice(0, 110));
    return r;
  } catch (e) {
    console.log(String(label).padEnd(38), String(Date.now() - t0).padStart(6) + 'ms', 'ERR:', e.message);
    return null;
  }
}

// 1) Leitura light (readRemoteStateForWrite)
await timed('slices light (atd+hist+estlog+cfg)', async () => {
  const { data, error } = await sb.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: T,
    p_keys: ['atendimentos', 'atendimentoHistorico', 'atendimentoEstornoLog', 'configuracoesSistema'],
  });
  if (error) throw error;
  return { bytes: JSON.stringify(data).length };
});

// 2) IDs dos lotes MULTIPLOS no array (o UI usa este id no estorno)
const { data: sl } = await sb.rpc('iso_pro_read_snapshot_slices', { p_tenant_id: T, p_keys: ['atendimentos'] });
const atds = (sl?.atendimentos ?? []);
for (const a of atds) {
  const n = String(a.numero ?? '');
  if (n.includes('20260712-00080') || n.includes('20260712-00081')) {
    console.log('lote array:', n, '| id:', a.id, '| status:', a.status, '| itens:', (a.itens ?? []).length,
      '| docsNosItens:', [...new Set((a.itens ?? []).map((i) => i.documentoNumero).filter(Boolean))]);
  }
}

// 3) RPC por desenho (carregarDocumentosParaEstorno)
await timed('read_doc IE6-00003-UNDER', async () => {
  const { data, error } = await sb.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: T, p_documento_id: null, p_numero: 'E.RAZN010-IE6-00003-UNDER SPDA', p_revisao: null,
  });
  if (error) throw error;
  return { id: data?.documento?.id, nItens: data?.documento?.itens?.length };
});
await timed('read_doc IE6-00022-ABOVE', async () => {
  const { data, error } = await sb.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: T, p_documento_id: null, p_numero: 'E.RAZN010-IE6-00022-ABOVE SPDA', p_revisao: null,
  });
  if (error) throw error;
  return { id: data?.documento?.id, nItens: data?.documento?.itens?.length };
});

// 4) Fallback pesado (readSnapshotPayload completo) — o suspeito do timeout
await timed('snapshot payload COMPLETO', async () => {
  const { data, error } = await sb.from('iso_pro_snapshot').select('payload').eq('id', 'default').eq('tenant_id', T).maybeSingle();
  if (error) throw error;
  return { MB: (JSON.stringify(data.payload).length / 1048576).toFixed(1) };
});

// 5) fetchQuantidadeAtendidaPorCodigo (tabelas escala)
await timed('quantidade atendida por codigo (tab)', async () => {
  const { count, error } = await sb.from('iso_pro_documento_itens_planejamento').select('*', { count: 'exact', head: true }).eq('tenant_id', T);
  if (error) throw error;
  return { linhas: count };
});
