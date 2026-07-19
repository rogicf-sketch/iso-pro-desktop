/**
 * Reconciliação completa por código: recebido vs previsto (planejamento) vs atendido.
 * Mesmas regras do app (documentoPlanejamento.ts / saldoFromSnapshot.ts).
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const { data: snap, error } = await sb
  .from('iso_pro_snapshot')
  .select('payload, documentos')
  .eq('id', 'default')
  .eq('tenant_id', T)
  .maybeSingle();
if (error || !snap) throw new Error(error?.message ?? 'sem snapshot');
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
const docs = snap.documentos ?? [];
const recs = pl.recebimentos ?? [];

const map = new Map();
const get = (c) => {
  if (!map.has(c)) map.set(c, { prevista: 0, atendido: 0, recebido: 0, descricao: '' });
  return map.get(c);
};

for (const d of docs) {
  if (norm(d.status) === 'cancelado') continue;
  for (const it of d.itens ?? []) {
    const c = norm(it.codigo ?? it.codigoMaterial);
    if (!c) continue;
    const m = get(c);
    m.prevista += num(it.quantidade ?? it.quantidadeProjeto);
    m.atendido += num(it.quantidadeAtendida ?? it.quantidade_atendida);
    if (!m.descricao) m.descricao = String(it.descricao ?? '').slice(0, 50);
  }
}

let itensLegadosRestantes = 0;
for (const r of recs) {
  const st = norm(r.statusConferencia ?? '') === 'conferido' ? 'conferido' : norm(r.status ?? '');
  if (st === 'cancelado' || st === 'rascunho') continue;
  const modo = norm(r.modoRecebimento) || 'direto';
  const conta = modo === 'direto' || ['conferido', 'parcialmente_conferido', 'divergente'].includes(st);
  if (!conta) continue;
  for (const it of r.itens ?? []) {
    if (it.codigo == null && it.codigoMaterial != null) itensLegadosRestantes++;
    const c = norm(it.codigo ?? it.codigoMaterial);
    if (!c) continue;
    const m = get(c);
    let q;
    if (modo === 'direto') q = Math.max(0, num(it.quantidade ?? it.quantidadeRecebida));
    else if (it.quantidadeConferida != null && Number.isFinite(Number(it.quantidadeConferida)))
      q = Math.max(0, Number(it.quantidadeConferida));
    else q = Math.max(0, num(it.quantidade ?? it.quantidadeRecebida));
    m.recebido += q;
    if (!m.descricao) m.descricao = String(it.descricao ?? it.descricaoMaterial ?? '').slice(0, 50);
  }
}

console.log('itens legados restantes nos recebimentos (deveria ser 0):', itensLegadosRestantes);
console.log('códigos totais:', map.size);

const rows = [...map.entries()].map(([c, m]) => ({
  codigo: c,
  prevista: +m.prevista.toFixed(3),
  recebido: +m.recebido.toFixed(3),
  atendido: +m.atendido.toFixed(3),
  saldo: +Math.max(0, m.recebido - m.atendido).toFixed(3),
}));

const soPlanejado = rows.filter((r) => r.prevista > 0 && r.recebido === 0);
const soRecebido = rows.filter((r) => r.prevista === 0 && r.recebido > 0);
const atendidoSemSaldo = rows.filter((r) => r.atendido > r.recebido + 1e-9);
const recebidoAcimaPlanejado = rows.filter((r) => r.prevista > 0 && r.recebido > r.prevista + 1e-9);
const ok = rows.filter((r) => r.prevista > 0 && r.recebido > 0 && r.atendido <= r.recebido + 1e-9);

console.log('\n== RESUMO ==');
console.log('planejado e recebido (ok):', ok.length);
console.log('planejado sem nenhum recebimento:', soPlanejado.length);
console.log('recebido sem planejamento:', soRecebido.length);
console.log('ATENDIDO > RECEBIDO (inconsistência grave):', atendidoSemSaldo.length);
console.log('recebido acima do planejado:', recebidoAcimaPlanejado.length);

if (atendidoSemSaldo.length) {
  console.log('\n-- atendido > recebido --');
  for (const r of atendidoSemSaldo.slice(0, 30)) console.log(JSON.stringify(r));
}
if (recebidoAcimaPlanejado.length) {
  console.log('\n-- recebido > planejado (top 15 por excesso) --');
  for (const r of recebidoAcimaPlanejado
    .sort((a, b) => b.recebido - b.prevista - (a.recebido - a.prevista))
    .slice(0, 15))
    console.log(JSON.stringify(r));
}
if (soRecebido.length) {
  console.log('\n-- recebido sem planejamento (top 15) --');
  for (const r of soRecebido.slice(0, 15)) console.log(JSON.stringify(r));
}
console.log('\n-- amostra planejado sem recebimento (top 15 por prevista) --');
for (const r of soPlanejado.sort((a, b) => b.prevista - a.prevista).slice(0, 15)) console.log(JSON.stringify(r));

const alvo = rows.find((r) => r.codigo === 'parssb0p.10');
console.log('\nPARSSB0P.10:', JSON.stringify(alvo));
