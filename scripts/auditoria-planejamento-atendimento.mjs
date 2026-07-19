/**
 * Auditoria completa: planejamento x atendimento x recebimentos (snapshot da nuvem).
 * So leitura. Classifica inconsistencias por tipo.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
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
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const supabase = createClient(url, key, { auth: { persistSession: false } });

const EPS = 1e-6;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const norm = (v) => String(v ?? '').trim().toLowerCase();

function recebimentoConta(rec) {
  const modo = norm(rec.modoRecebimento ?? 'direto') || 'direto';
  const st = norm(rec.statusConferencia ?? rec.status);
  if (st === 'cancelado' || st === 'rascunho') return false;
  if (modo === 'direto') return true;
  return ['conferido', 'parcialmente_conferido', 'divergente'].includes(st);
}
function qtdRec(rec, item) {
  if (!recebimentoConta(rec)) return 0;
  const modo = norm(rec.modoRecebimento ?? 'direto') || 'direto';
  if (modo === 'direto') return Math.max(0, num(item.quantidade));
  if (item.quantidadeConferida != null) return Math.max(0, num(item.quantidadeConferida));
  return Math.max(0, num(item.quantidade));
}

async function main() {
  const { data: snap } = await supabase
    .from('iso_pro_snapshot')
    .select('payload, updated_at')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
  const docs = pl.documentos ?? [];
  const recs = pl.recebimentos ?? [];
  const hist = pl.atendimentoHistorico ?? [];
  const atds = pl.atendimentos ?? [];
  const lotes = pl.atendimentoLotes ?? [];

  console.log('Snapshot updated_at:', snap.updated_at);
  console.log('documentos:', docs.length, '| recebimentos:', recs.length, '| historico:', hist.length, '| atendimentos:', atds.length, '| lotes:', lotes.length);
  console.log('');

  // Indices
  const docIds = new Set(docs.map((d) => String(d.id)));
  const docByNumero = new Map();
  for (const d of docs) docByNumero.set(norm(d.numero) + '|' + norm(d.revisao), d);

  // metricas por codigo (prevista/recebido/atendido)
  const met = new Map();
  for (const d of docs) {
    if (norm(d.status) === 'cancelado') continue;
    for (const it of d.itens ?? []) {
      const c = norm(it.codigo);
      if (!c) continue;
      const m = met.get(c) ?? { prevista: 0, recebido: 0, atendido: 0 };
      m.prevista += num(it.quantidade);
      m.atendido += num(it.quantidadeAtendida ?? it.quantidade_atendida);
      met.set(c, m);
    }
  }
  for (const r of recs) {
    if (!recebimentoConta(r)) continue;
    for (const it of r.itens ?? []) {
      const c = norm(it.codigo);
      if (!c) continue;
      const m = met.get(c) ?? { prevista: 0, recebido: 0, atendido: 0 };
      m.recebido += qtdRec(r, it);
      met.set(c, m);
    }
  }

  // historico agregado por doc+codigo e por documentoId
  const histPorDocCod = new Map();
  const histPorCodigo = new Map();
  const histDocIdsRef = new Map();
  for (const h of hist) {
    const dnum = norm(h.documento);
    const c = norm(h.codigo);
    const q = num(h.quantidade ?? h.quantidadeAtendida ?? h.qtd);
    histPorDocCod.set(dnum + '|' + c, (histPorDocCod.get(dnum + '|' + c) ?? 0) + q);
    histPorCodigo.set(c, (histPorCodigo.get(c) ?? 0) + q);
    const ref = h.documentoId != null ? String(h.documentoId) : null;
    if (ref) histDocIdsRef.set(ref, (histDocIdsRef.get(ref) ?? 0) + 1);
  }

  const problemas = {
    A_atendido_sem_historico: [],     // qAt linha > soma historico
    B_historico_sem_planejamento: [], // linha historico sem doc/codigo no planejamento
    C_atendido_excede_projeto: [],    // qAt > qProj na linha
    D_atendido_excede_recebido: [],   // atendido global por codigo > recebido global
    E_historico_doc_inexistente: [],  // documentoId do historico nao existe nos docs
    F_linha_status_incoerente: [],    // status coluna vs derivado (amostra)
    G_atendimentos_doc_inexistente: [],
  };

  // A + C por linha
  let linhasComAt = 0;
  for (const d of docs) {
    for (const it of d.itens ?? []) {
      const a = num(it.quantidadeAtendida ?? it.quantidade_atendida);
      const q = num(it.quantidade);
      const c = norm(it.codigo);
      if (a > EPS) {
        linhasComAt++;
        const hSum = histPorDocCod.get(norm(d.numero) + '|' + c) ?? 0;
        if (hSum + EPS < a) {
          problemas.A_atendido_sem_historico.push({ doc: d.numero, rev: d.revisao, cod: it.codigo, qAt: a, hist: hSum, falta: +(a - hSum).toFixed(2) });
        }
        if (a > q + EPS) {
          problemas.C_atendido_excede_projeto.push({ doc: d.numero, cod: it.codigo, qAt: a, qProj: q });
        }
      }
    }
  }

  // B: historico sem planejamento correspondente
  for (const h of hist) {
    const c = norm(h.codigo);
    const dnum = norm(h.documento);
    const doc = [...docByNumero.entries()].find(([k]) => k.startsWith(dnum + '|'));
    let temLinha = false;
    if (doc) temLinha = (doc[1].itens ?? []).some((it) => norm(it.codigo) === c);
    if (!temLinha) {
      problemas.B_historico_sem_planejamento.push({ doc: h.documento, cod: h.codigo, q: num(h.quantidade), lote: h.loteNumero });
    }
  }

  // D: atendido global > recebido global
  for (const [c, m] of met) {
    if (m.atendido > m.recebido + EPS && m.atendido > EPS) {
      problemas.D_atendido_excede_recebido.push({ cod: c, atendido: +m.atendido.toFixed(2), recebido: +m.recebido.toFixed(2), prevista: +m.prevista.toFixed(2) });
    }
  }

  // E: documentoId do historico inexistente
  for (const [ref, n] of histDocIdsRef) {
    if (!docIds.has(ref)) problemas.E_historico_doc_inexistente.push({ documentoId: ref, linhas: n });
  }

  // G: atendimentos com documentoId inexistente
  for (const a of atds) {
    const ref = a.documentoId != null ? String(a.documentoId) : null;
    if (ref && !docIds.has(ref)) {
      problemas.G_atendimentos_doc_inexistente.push({ numero: a.numero, documentoId: ref, documentoNumero: a.documentoNumero });
    }
  }

  // Sumario
  const totalSemHistQtd = problemas.A_atendido_sem_historico.reduce((s, x) => s + x.falta, 0);
  const docsSemHist = new Set(problemas.A_atendido_sem_historico.map((x) => x.doc));

  console.log('===== RESUMO DE INCONSISTENCIAS =====');
  console.log(`A) Linhas atendidas SEM historico completo: ${problemas.A_atendido_sem_historico.length} linhas | ${docsSemHist.size} desenhos | ${totalSemHistQtd.toFixed(1)} un`);
  console.log(`B) Historico SEM planejamento correspondente: ${problemas.B_historico_sem_planejamento.length}`);
  console.log(`C) Atendido EXCEDE quantidade do projeto (linha): ${problemas.C_atendido_excede_projeto.length}`);
  console.log(`D) Atendido global EXCEDE recebido (por codigo): ${problemas.D_atendido_excede_recebido.length}`);
  console.log(`E) Historico aponta documentoId inexistente: ${problemas.E_historico_doc_inexistente.length}`);
  console.log(`G) Atendimentos apontam documentoId inexistente: ${problemas.G_atendimentos_doc_inexistente.length}`);
  console.log(`   (linhas com atendimento no total: ${linhasComAt})`);
  console.log('');

  console.log('--- C (amostra, grave se houver) ---');
  console.log(JSON.stringify(problemas.C_atendido_excede_projeto.slice(0, 15), null, 1));
  console.log('--- D (amostra, grave se houver) ---');
  console.log(JSON.stringify(problemas.D_atendido_excede_recebido.slice(0, 15), null, 1));
  console.log('--- E (amostra) ---');
  console.log(JSON.stringify(problemas.E_historico_doc_inexistente.slice(0, 10), null, 1));
  console.log('--- G (amostra) ---');
  console.log(JSON.stringify(problemas.G_atendimentos_doc_inexistente.slice(0, 10), null, 1));
  console.log('--- B (amostra) ---');
  console.log(JSON.stringify(problemas.B_historico_sem_planejamento.slice(0, 10), null, 1));

  // Grava relatorio completo
  const outPath = path.join(projectRoot, 'release', 'auditoria-planejamento-atendimento-20260718.json');
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ geradoEm: new Date().toISOString(), snapshotUpdatedAt: snap.updated_at, resumo: {
      A: { linhas: problemas.A_atendido_sem_historico.length, desenhos: docsSemHist.size, unidades: +totalSemHistQtd.toFixed(1) },
      B: problemas.B_historico_sem_planejamento.length,
      C: problemas.C_atendido_excede_projeto.length,
      D: problemas.D_atendido_excede_recebido.length,
      E: problemas.E_historico_doc_inexistente.length,
      G: problemas.G_atendimentos_doc_inexistente.length,
    }, problemas }, null, 1));
    console.log('\nRelatorio completo:', outPath);
  } catch (e) {
    console.log('nao gravou relatorio:', e.message);
  }
}

main().catch((e) => { console.error('FALHA:', e.message); process.exit(1); });
