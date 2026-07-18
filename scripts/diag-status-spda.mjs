/** Verifica status na tabela vs lógica do cliente para docs SPDA. */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '..', '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const supabase = createClient(url, key, { auth: { persistSession: false } });

const EPS = 1e-9;
const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const atinge = (a, b) => a + EPS >= b;

function recebimentoConta(rec) {
  const modo = norm(rec.modoRecebimento ?? 'direto') || 'direto';
  const status = norm(rec.statusConferencia) === 'conferido' ? 'conferido'
    : modo === 'aguardando_conferencia' ? 'aguardando_conferencia' : 'conferido';
  if (status === 'cancelado' || status === 'rascunho') return false;
  if (modo === 'direto') return true;
  return ['conferido', 'parcialmente_conferido', 'divergente'].includes(status);
}

function qtdRec(rec, item) {
  if (!recebimentoConta(rec)) return 0;
  const modo = norm(rec.modoRecebimento ?? 'direto') || 'direto';
  if (modo === 'direto') return Math.max(0, num(item.quantidade));
  const qc = item.quantidadeConferida;
  if (qc != null && Number.isFinite(Number(qc))) return Math.max(0, Number(qc));
  return Math.max(0, num(item.quantidade));
}

function montarMetricas(docs, recs) {
  const map = new Map();
  for (const doc of docs) {
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
  for (const rec of recs) {
    if (!recebimentoConta(rec)) continue;
    for (const item of rec.itens ?? []) {
      const cod = norm(item.codigo);
      if (!cod) continue;
      const cur = map.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      cur.recebido += qtdRec(rec, item);
      map.set(cod, cur);
    }
  }
  return map;
}

function statusLinha(item, m) {
  const atendLin = num(item.quantidadeAtendida ?? item.quantidade_atendida);
  const qtdLin = num(item.quantidade);
  if (qtdLin > 0 && atinge(atendLin, qtdLin)) return 'atendido';
  if (m.recebido <= 0) return 'pendente';
  if (!atinge(m.recebido, m.prevista)) return 'parcial';
  if (!atinge(m.atendido, m.prevista)) return 'recebido';
  if (!atinge(atendLin, qtdLin)) return 'recebido';
  if (m.prevista <= 0) return 'pendente';
  if (atinge(m.atendido, m.prevista)) return 'atendido';
  if (atinge(m.recebido, m.prevista)) return 'recebido';
  if (m.recebido > 0) return 'parcial';
  return 'pendente';
}

function statusDoc(doc, metricas) {
  if (norm(doc.status) === 'cancelado') return 'cancelado';
  const itens = doc.itens ?? [];
  if (!itens.length) return 'pendente';
  if (itens.every((it) => {
    const q = num(it.quantidade);
    return q <= 0 || atinge(num(it.quantidadeAtendida ?? it.quantidade_atendida), q);
  })) return 'atendido';
  const sts = itens.map((it) => statusLinha(it, metricas.get(norm(it.codigo)) ?? { prevista: 0, recebido: 0, atendido: 0 }));
  if (sts.every((s) => s === 'atendido')) return 'atendido';
  if (sts.every((s) => s === 'recebido' || s === 'atendido')) return 'recebido';
  if (sts.every((s) => s === 'pendente')) return 'pendente';
  return 'parcial';
}

async function main() {
  const { data: snap } = await supabase.from('iso_pro_snapshot').select('payload').eq('id', 'default').eq('tenant_id', TENANT).maybeSingle();
  const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
  const metricas = montarMetricas(pl.documentos ?? [], pl.recebimentos ?? []);

  const alvo = (pl.documentos ?? []).filter((d) => String(d.numero ?? '').includes('E.RAZN010-IE6-00001') || String(d.numero ?? '').includes('E.RAZN010-IE6-00026-UNDER'));
  for (const d of alvo) {
    const calc = statusDoc(d, metricas);
    const { data: row } = await supabase.from('iso_pro_documentos_planejamento').select('numero,status').eq('tenant_id', TENANT).eq('id', String(d.id)).maybeSingle();
    const qProj = (d.itens ?? []).reduce((s, i) => s + num(i.quantidade), 0);
    const qAt = (d.itens ?? []).reduce((s, i) => s + num(i.quantidadeAtendida ?? i.quantidade_atendida), 0);
    const lineSt = (d.itens ?? []).map((it) => {
      const cod = norm(it.codigo);
      const m = metricas.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      return `${it.codigo}:${statusLinha(it, m)}(prev=${m.prevista},rec=${m.recebido},at=${m.atendido},linAt=${num(it.quantidadeAtendida ?? it.quantidade_atendida)}/${num(it.quantidade)})`;
    });
    console.log('---');
    console.log(d.numero, 'rev', d.revisao);
    console.log('  qtd', qAt, '/', qProj);
    console.log('  calculado cliente:', calc);
    console.log('  coluna tabela:', row?.status);
    console.log('  linhas:', lineSt.join(' | '));
  }

  // PAEKA exemplo
  const cod = 'paeka0c0b9-8033080';
  const m = metricas.get(cod);
  console.log('--- PAEKA0C0B9-8033080 metricas:', m);
}

main().catch((e) => { console.error(e); process.exit(1); });
