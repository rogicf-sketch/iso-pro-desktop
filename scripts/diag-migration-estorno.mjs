import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload, updated_at').eq('id','default').eq('tenant_id',T).maybeSingle();
console.log('snapshot updated_at:', snap?.updated_at);
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
console.log('estornoLog length:', (pl.atendimentoEstornoLog ?? []).length);

// Docs from the screenshot lot (00013-ABOVE items)
const codes = ['arlcpb0g','ater0003','bccc0l00','bet1sn0b','ccbr0bp31'];
const docs = (pl.documentos ?? []).filter((d) => norm(d.numero).includes('00013-above') || norm(d.numero).includes('e.razn010-ie6-00013'));
console.log('docs 00013 found:', docs.map((d) => d.numero + ' rev' + d.revisao));
for (const d of docs) {
  for (const it of d.itens ?? []) {
    const c = norm(it.codigo ?? it.codigoMaterial);
    if (codes.includes(c)) {
      console.log(JSON.stringify({ doc: d.numero, cod: c, qAt: num(it.quantidadeAtendida ?? it.quantidade_atendida), qProj: num(it.quantidade ?? it.quantidadeProjeto), id: it.id }));
    }
  }
}

// Historico for that ATD
const hist = (pl.atendimentoHistorico ?? []).filter((h) => String(h.loteNumero ?? '').includes('00082') || String(h.loteNumero ?? '').includes('00013') || codes.includes(norm(h.codigo)));
const byLote = new Map();
for (const h of pl.atendimentoHistorico ?? []) {
  const n = String(h.loteNumero ?? '');
  if (!n) continue;
  if (![...codes].some((c) => norm(h.codigo) === c)) continue;
  byLote.set(n, (byLote.get(n) ?? 0) + 1);
}
console.log('lotes mentioning screenshot codes:', [...byLote.entries()].slice(0,10));

// Probe: does 4-arg assert exist? Call with nulls via a tiny SQL trick - use rpc that might not exist
const { error: e1 } = await sb.rpc('iso_pro_assert_atendimento_documentos_progresso', {
  p_current: {},
  p_documentos_patch: [],
  p_tem_historico_ou_lote: false,
  p_eh_estorno: true,
});
console.log('assert 4-arg probe:', e1?.message ?? e1?.code ?? 'OK (callable)');
const { error: e2 } = await sb.rpc('iso_pro_assert_atendimento_documentos_progresso', {
  p_current: {},
  p_documentos_patch: [],
  p_tem_historico_ou_lote: false,
});
console.log('assert 3-arg probe:', e2?.message ?? e2?.code ?? 'OK (callable)');
