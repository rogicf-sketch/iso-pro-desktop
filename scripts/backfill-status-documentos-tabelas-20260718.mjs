/**
 * Backfill 18/07/2026: recalcula a coluna `status` de iso_pro_documentos_planejamento.
 *
 * Contexto: o restauro de 12/07 upsertou os 4073 docs sem `status` e a lista paginada
 * (migration 20260712141000) le o status da coluna — tudo aparecia "Pendente".
 *
 * Regras identicas ao cliente (documentoPlanejamento.ts):
 *   - metricas por codigo (prevista/recebido/atendido) a partir de documentos+recebimentos do snapshot
 *   - resolverStatusLinhaDocumento + resolverStatusDocumentoPlanejamento
 *
 * Uso: node --use-system-ca scripts/backfill-status-documentos-tabelas-20260718.mjs
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const EPS = 1e-9;
const CHUNK_IDS = 150;

const supabase = createClient(url, key, { auth: { persistSession: false } });

const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const atinge = (valor, meta) => valor + EPS >= meta;

function recebimentoConta(rec) {
  const modo = norm(rec.modoRecebimento ?? 'direto') || 'direto';
  const status =
    norm(rec.statusConferencia) === 'conferido'
      ? 'conferido'
      : modo === 'aguardando_conferencia'
        ? 'aguardando_conferencia'
        : 'conferido';
  if (status === 'cancelado' || status === 'rascunho') return false;
  if (modo === 'direto') return true;
  return status === 'conferido' || status === 'parcialmente_conferido' || status === 'divergente';
}

function qtdItemRecebimento(rec, item) {
  if (!recebimentoConta(rec)) return 0;
  const modo = norm(rec.modoRecebimento ?? 'direto') || 'direto';
  if (modo === 'direto') return Math.max(0, num(item.quantidade));
  const qc = item.quantidadeConferida;
  if (qc !== undefined && qc !== null && Number.isFinite(Number(qc))) return Math.max(0, Number(qc));
  return Math.max(0, num(item.quantidade));
}

function montarMetricas(documentos, recebimentos) {
  const map = new Map();
  for (const doc of documentos) {
    if (norm(doc.status) === 'cancelado') continue;
    for (const item of doc.itens ?? []) {
      const cod = norm(item.codigo);
      if (!cod) continue;
      const cur = map.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      cur.prevista += num(item.quantidade);
      cur.atendido += num(item.quantidadeAtendida ?? item.quantidade_atendida);
      map.set(cod, cur);
    }
  }
  for (const rec of recebimentos) {
    if (!recebimentoConta(rec)) continue;
    for (const item of rec.itens ?? []) {
      const cod = norm(item.codigo);
      if (!cod) continue;
      const cur = map.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      cur.recebido += qtdItemRecebimento(rec, item);
      map.set(cod, cur);
    }
  }
  return map;
}

function statusMaterial(m) {
  if (m.prevista <= 0) return 'pendente';
  if (atinge(m.atendido, m.prevista)) return 'atendido';
  if (atinge(m.recebido, m.prevista)) return 'recebido';
  if (m.recebido > 0) return 'parcial';
  return 'pendente';
}

function statusLinha(item, metricas) {
  const cod = norm(item.codigo);
  const m = metricas.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
  const atendLin = num(item.quantidadeAtendida ?? item.quantidade_atendida);
  const qtdLin = num(item.quantidade);
  if (qtdLin > 0 && atinge(atendLin, qtdLin)) return 'atendido';
  if (m.recebido <= 0) return 'pendente';
  if (!atinge(m.recebido, m.prevista)) return 'parcial';
  if (!atinge(m.atendido, m.prevista)) return 'recebido';
  if (!atinge(atendLin, qtdLin)) return 'recebido';
  return statusMaterial(m);
}

function linhaTotalmenteAtendida(item) {
  const qtd = num(item.quantidade);
  if (qtd <= 0) return true;
  return atinge(num(item.quantidadeAtendida ?? item.quantidade_atendida), qtd);
}

function statusDocumento(doc, metricas) {
  if (norm(doc.status) === 'cancelado') return 'cancelado';
  const itens = doc.itens ?? [];
  if (!itens.length) return 'pendente';
  if (itens.every(linhaTotalmenteAtendida)) return 'atendido';
  const statuses = itens.map((it) => statusLinha(it, metricas));
  if (statuses.every((s) => s === 'atendido')) return 'atendido';
  if (statuses.every((s) => s === 'recebido' || s === 'atendido')) return 'recebido';
  if (statuses.every((s) => s === 'pendente')) return 'pendente';
  return 'parcial';
}

async function main() {
  const { data: snapRow, error: snapErr } = await supabase
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  if (snapErr || !snapRow) throw new Error('Falha a ler snapshot: ' + (snapErr?.message ?? 'sem linha'));
  const pl = typeof snapRow.payload === 'string' ? JSON.parse(snapRow.payload) : snapRow.payload;
  const docs = pl.documentos ?? [];
  const recs = pl.recebimentos ?? [];
  console.log('Snapshot: documentos =', docs.length, '| recebimentos =', recs.length);

  const metricas = montarMetricas(docs, recs);
  const porStatus = new Map();
  for (const doc of docs) {
    const id = String(doc.id ?? '').trim();
    if (!id) continue;
    const st = statusDocumento(doc, metricas);
    const arr = porStatus.get(st) ?? [];
    arr.push(id);
    porStatus.set(st, arr);
  }
  for (const [st, ids] of porStatus) console.log(`  status "${st}": ${ids.length} documento(s)`);

  let totalUpdated = 0;
  for (const [st, ids] of porStatus) {
    for (let i = 0; i < ids.length; i += CHUNK_IDS) {
      const chunk = ids.slice(i, i + CHUNK_IDS);
      let tentativa = 0;
      for (;;) {
        tentativa += 1;
        const { error, count } = await supabase
          .from('iso_pro_documentos_planejamento')
          .update({ status: st }, { count: 'exact' })
          .eq('tenant_id', TENANT)
          .in('id', chunk);
        if (!error) {
          totalUpdated += count ?? chunk.length;
          break;
        }
        if (tentativa >= 3) throw new Error(`Update status "${st}" chunk ${i / CHUNK_IDS}: ${error.message}`);
        await new Promise((r) => setTimeout(r, 1500 * tentativa));
      }
    }
    console.log(`  gravado "${st}" (${ids.length})`);
  }
  console.log('Linhas atualizadas:', totalUpdated);

  // Verificacao: doc do print + docs ainda com status NULL
  const { data: verif } = await supabase
    .from('iso_pro_documentos_planejamento')
    .select('numero, revisao, status')
    .eq('tenant_id', TENANT)
    .ilike('numero', 'E.RAZN010-IE6-00026%');
  console.log('VERIFICACAO E.RAZN010-IE6-00026*:', JSON.stringify(verif));

  const { count: semStatus } = await supabase
    .from('iso_pro_documentos_planejamento')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT)
    .is('status', null);
  console.log('Docs ainda com status NULL na tabela:', semStatus);
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
