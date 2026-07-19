import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload, updated_at').eq('id','default').eq('tenant_id',T).maybeSingle();
console.log('snapshot updated_at:', snap.updated_at);
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;

console.log('=== ESTORNO LOG ===', (pl.atendimentoEstornoLog ?? []).length);
for (const e of (pl.atendimentoEstornoLog ?? []).slice(-10)) {
  console.log(JSON.stringify({ data: e.dataEstorno, lote: e.loteNumero, cod: e.codigoMaterial, q: e.quantidadeEstornada, doc: e.documentoNumero }));
}

console.log('=== DOC 00013-ABOVE no snapshot ===');
const doc = (pl.documentos ?? []).find((d) => norm(d.numero).includes('00013-above'));
for (const it of doc?.itens ?? []) {
  console.log(it.codigo, 'qAt:', it.quantidadeAtendida, '/', it.quantidade);
}

console.log('=== HISTORICO lote ATD-20260711-00080 ===');
for (const h of (pl.atendimentoHistorico ?? []).filter((x) => String(x.loteNumero ?? '').includes('20260711-00080'))) {
  console.log(JSON.stringify({ cod: h.codigo, q: h.quantidade, doc: h.documento }));
}

console.log('=== ATENDIMENTOS array (lote) ===');
for (const a of (pl.atendimentos ?? []).filter((x) => String(x.numero ?? '').includes('20260711-00080'))) {
  console.log(JSON.stringify({ id: a.id, status: a.status, itens: (a.itens ?? []).map((i)=>({c:i.codigoMaterial ?? i.codigo, q:i.quantidadeAtendida})) }));
}

console.log('=== COMANDOS de hoje ===');
const { data: cmds } = await sb.from('iso_pro_atendimento_comandos').select('idempotency_key, created_at, payload').eq('tenant_id',T).gte('created_at','2026-07-18T21:00:00Z').order('created_at',{ascending:false}).limit(5);
for (const c of cmds ?? []) {
  const p = c.payload ?? {};
  console.log(c.created_at, c.idempotency_key.slice(0,60), '| keys:', Object.keys(p), '| docsPatch:', (p.documentos ?? []).length, '| estLog:', (p.atendimentoEstornoLog ?? []).length);
  for (const d of (p.documentos ?? [])) {
    console.log('   docPatch:', d.numero, (d.itens ?? []).map((i)=>({c:i.codigo, qAt:i.quantidadeAtendida})).slice(0,6));
  }
}

console.log('=== TABELA escala (itens 00013-ABOVE) ===');
const { data: rows } = await sb.from('iso_pro_documento_itens_planejamento').select('codigo, quantidade, quantidade_atendida').eq('tenant_id',T).eq('documento_id', String(doc?.id ?? '')).limit(12);
for (const r of rows ?? []) console.log(r.codigo, 'qAt:', r.quantidade_atendida, '/', r.quantidade);
