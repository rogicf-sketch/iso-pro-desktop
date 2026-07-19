/**
 * Normaliza recebimentos do snapshot para o formato canônico da nuvem.
 * A restauração de 2026-07-18 gravou os registos no formato local do Electron
 * (codigoMaterial/notaFiscal/quantidadeRecebida); o desktop lê codigo/nota/quantidade.
 * Faz backup do array antes de gravar.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const T = '00000000-0000-0000-0000-000000000001';
const s = (v) => String(v ?? '').trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const { data: snap, error: e1 } = await sb
  .from('iso_pro_snapshot')
  .select('payload, updated_at')
  .eq('id', 'default')
  .eq('tenant_id', T)
  .maybeSingle();
if (e1 || !snap) throw new Error(e1?.message ?? 'sem snapshot');
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
const recs = pl.recebimentos ?? [];
console.log('recebimentos na nuvem:', recs.length, '| baseline:', snap.updated_at);

const backupFile = path.resolve(`scripts/backup-recebimentos-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(backupFile, JSON.stringify(recs, null, 2), 'utf8');
console.log('backup gravado em', backupFile);

function normalizarItem(it, recId, idx) {
  const codigo = s(it.codigo) || s(it.codigoMaterial ?? it.codigo_material);
  return {
    id: s(it.id) || `${recId}-item-${idx + 1}`,
    codigo,
    descricao: s(it.descricao) || s(it.descricaoMaterial ?? it.descricao_material),
    unidade: s(it.unidade) || 'UN',
    disciplina: s(it.disciplina),
    localizacao: s(it.localizacao),
    certificado: s(it.certificado),
    quantidade: it.quantidade != null ? num(it.quantidade) : num(it.quantidadeRecebida ?? it.quantidade_recebida),
    quantidadeConferida: num(it.quantidadeConferida ?? it.quantidade_conferida),
    pesoUnitario: num(it.pesoUnitario ?? it.peso_unitario),
    pesoTotal: num(it.pesoTotal ?? it.peso_total),
    observacaoItem: s(it.observacaoItem ?? it.observacao_item),
  };
}

let convertidos = 0;
const normalizados = recs.map((r) => {
  const jaCanonico = r.nota !== undefined && (r.itens ?? []).every((i) => i.codigo != null);
  if (jaCanonico) return r;
  convertidos++;
  const statusConferencia =
    s(r.statusConferencia) === 'conferido' || s(r.status) === 'conferido' ? 'conferido' : 'pendente';
  return {
    id: s(r.id),
    data: s(r.data) || s(r.dataRecebimento),
    nota: s(r.nota) || s(r.notaFiscal),
    romaneio: s(r.romaneio),
    fornecedorNome: s(r.fornecedorNome) || s(r.fornecedor),
    conferenteNome: s(r.conferenteNome) || s(r.conferente),
    observacoes: s(r.observacoes),
    modoRecebimento: s(r.modoRecebimento) || 'direto',
    status: s(r.status) || undefined,
    statusConferencia,
    ...(s(r.dataConferencia) ? { dataConferencia: s(r.dataConferencia) } : {}),
    itens: (r.itens ?? []).map((it, idx) => normalizarItem(it, s(r.id), idx)),
  };
});
console.log('convertidos para canônico:', convertidos, '| já corretos:', recs.length - convertidos);

const semCodigo = normalizados.flatMap((r) => (r.itens ?? []).filter((i) => !i.codigo).map(() => r.nota));
if (semCodigo.length) console.log('AVISO: itens sem código após conversão:', semCodigo.length, semCodigo.slice(0, 5));

if (convertidos > 0) {
  const { error: e2 } = await sb.rpc('iso_pro_patch_snapshot', {
    p_tenant_id: T,
    p_baseline: snap.updated_at,
    p_patch: { recebimentos: normalizados, dataAtualizacao: new Date().toISOString() },
  });
  if (e2) throw new Error('patch: ' + e2.message);
  console.log('snapshot atualizado com formato canônico.');
  const { data: sync, error: e3 } = await sb.rpc('iso_pro_sync_recebimentos_from_snapshot', { p_tenant_id: T });
  console.log('sync escala:', e3 ? 'ERR ' + e3.message : JSON.stringify(sync));
} else {
  console.log('nada a fazer.');
}
