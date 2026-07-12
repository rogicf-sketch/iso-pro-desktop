import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import type {
  AtendimentoIntegridadeAchado,
  AtendimentoIntegridadeRelatorio,
} from '../types/atendimentoIntegridadeAudit.types';

type SnapshotAuditInput = {
  documentos?: unknown[];
  atendimentos?: unknown[];
  atendimentoHistorico?: unknown[];
};

type LoteItemAuditavel = {
  codigoMaterial: string;
  documentoNumero: string;
  quantidadeAtendida: number;
};

type LoteAuditavel = {
  numero: string;
  recebedor: string;
  dataAtendimento: string;
  status: 'concluido' | 'estornado';
  origem: string;
  itens: LoteItemAuditavel[];
};

function normDoc(s: unknown): string {
  return String(s ?? '').trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function qAtItem(item: Record<string, unknown>): number {
  return num(item.quantidadeAtendida ?? item.quantidade_atendida);
}

function qProjItem(item: Record<string, unknown>): number {
  return num(item.quantidade ?? item.quantidadeProjeto ?? item.quantidade_projeto);
}

function codigoItem(item: Record<string, unknown>): string {
  return String(item.codigoMaterial ?? item.codigo ?? '').trim();
}

function docNumeroItem(docNum?: unknown, fallback?: unknown): string {
  const n = normDoc(docNum ?? fallback);
  return n && n !== '-' ? n : '';
}

function extrairLotesDeAtendimentos(atendimentos: unknown[]): LoteAuditavel[] {
  const lotes: LoteAuditavel[] = [];
  for (const raw of atendimentos) {
    if (!raw || typeof raw !== 'object') continue;
    const at = raw as Record<string, unknown>;
    const status = String(at.status ?? 'concluido') === 'estornado' ? 'estornado' : 'concluido';
    const itensRaw = Array.isArray(at.itens) ? at.itens : [];
    const itens: LoteItemAuditavel[] = [];
    for (const ir of itensRaw) {
      if (!ir || typeof ir !== 'object') continue;
      const item = ir as Record<string, unknown>;
      const q = num(item.quantidadeAtendida);
      if (q <= 0) continue;
      const doc = docNumeroItem(item.documentoNumero, at.documentoNumero);
      const cod = codigoItem(item);
      if (!doc || !cod) continue;
      itens.push({ codigoMaterial: cod, documentoNumero: doc, quantidadeAtendida: q });
    }
    lotes.push({
      numero: String(at.numero ?? at.id ?? ''),
      recebedor: String(at.recebedor ?? '—'),
      dataAtendimento: String(at.dataAtendimento ?? at.data ?? ''),
      status,
      origem: String(at.origem ?? 'pc'),
      itens,
    });
  }
  return lotes.filter((l) => l.numero);
}

function extrairLotesDeHistorico(historico: unknown[], numerosJaVistos: Set<string>): LoteAuditavel[] {
  const porLote = new Map<string, LoteAuditavel>();
  for (const raw of historico) {
    if (!raw || typeof raw !== 'object') continue;
    const h = raw as Record<string, unknown>;
    const numero = String(h.loteNumero ?? h.numero ?? '').trim();
    if (!numero || numerosJaVistos.has(numero)) continue;
    const doc = docNumeroItem(h.documento);
    const cod = codigoItem(h);
    const q = num(h.quantidade);
    if (!doc || !cod || q <= 0) continue;
    let lote = porLote.get(numero);
    if (!lote) {
      lote = {
        numero,
        recebedor: String(h.recebedor ?? '—'),
        dataAtendimento: String(h.data ?? ''),
        status: 'concluido',
        origem: String(h.origem ?? 'mobile'),
        itens: [],
      };
      porLote.set(numero, lote);
    }
    lote.itens.push({ codigoMaterial: cod, documentoNumero: doc, quantidadeAtendida: q });
  }
  return [...porLote.values()];
}

export function extrairLotesParaAuditoria(payload: SnapshotAuditInput): LoteAuditavel[] {
  const atendimentos = Array.isArray(payload.atendimentos) ? payload.atendimentos : [];
  const historico = Array.isArray(payload.atendimentoHistorico) ? payload.atendimentoHistorico : [];
  const lotesAt = extrairLotesDeAtendimentos(atendimentos);
  const numeros = new Set(lotesAt.map((l) => l.numero));
  const lotesHist = extrairLotesDeHistorico(historico, numeros);
  return [...lotesAt, ...lotesHist];
}

export function auditarIntegridadeAtendimentoSnapshot(
  payload: SnapshotAuditInput,
  opts?: { snapshotUpdatedAt?: string | null; source?: AtendimentoIntegridadeRelatorio['source'] },
): AtendimentoIntegridadeRelatorio {
  const achados: AtendimentoIntegridadeAchado[] = [];
  const documentos = Array.isArray(payload.documentos) ? payload.documentos : [];
  const lotes = extrairLotesParaAuditoria(payload).filter((l) => l.status === 'concluido');

  let linhasPlanejamento = 0;

  for (const raw of documentos) {
    if (!raw || typeof raw !== 'object') continue;
    const doc = raw as Record<string, unknown>;
    const docNum = normDoc(doc.numero);
    const docRev = normDoc(doc.revisao);
    const itens = Array.isArray(doc.itens) ? doc.itens : [];
    for (const ir of itens) {
      if (!ir || typeof ir !== 'object') continue;
      linhasPlanejamento += 1;
      const item = ir as Record<string, unknown>;
      const qProj = qProjItem(item);
      const qAt = qAtItem(item);
      const cod = codigoItem(item);
      if (qAt > qProj + 0.001) {
        achados.push({
          severidade: 'critico',
          codigo: 'EXCEDE_PLANEJAMENTO',
          titulo: 'Atendido acima do planejamento',
          detalhe: `${docNum} rev. ${docRev}: material ${cod} atendido ${qAt} > projeto ${qProj}.`,
          documentoNumero: docNum,
          documentoRevisao: docRev,
          codigoMaterial: cod,
          valorNumerico: qAt,
          valorEsperado: qProj,
        });
      }
    }
  }

  const porDocMaterial = new Map<
    string,
    { documentoNumero: string; codigoMaterial: string; lotes: { numero: string; recebedor: string; qtd: number }[] }
  >();

  for (const lote of lotes) {
    for (const item of lote.itens) {
      const doc = normDoc(item.documentoNumero);
      const cod = codigoMaterialKey(item.codigoMaterial);
      if (!doc || !cod) continue;
      const key = `${doc}|${cod}`;
      const entry = porDocMaterial.get(key) ?? {
        documentoNumero: doc,
        codigoMaterial: item.codigoMaterial,
        lotes: [],
      };
      entry.lotes.push({
        numero: lote.numero,
        recebedor: lote.recebedor,
        qtd: item.quantidadeAtendida,
      });
      porDocMaterial.set(key, entry);
    }
  }

  for (const entry of porDocMaterial.values()) {
    if (entry.lotes.length < 2) continue;
    const numeros = [...new Set(entry.lotes.map((l) => l.numero))];
    if (numeros.length < 2) continue;
    achados.push({
      severidade: 'critico',
      codigo: 'LOTE_DUPLICADO_MATERIAL_DESENHO',
      titulo: 'Mesmo material atendido em varios lotes no mesmo desenho',
      detalhe: `Desenho ${entry.documentoNumero}, material ${entry.codigoMaterial}: ${numeros.join(', ')}.`,
      documentoNumero: entry.documentoNumero,
      codigoMaterial: entry.codigoMaterial,
      loteNumeros: numeros,
      recebedores: [...new Set(entry.lotes.map((l) => l.recebedor))],
    });
  }

  const porDesenho = new Map<string, { lotes: Set<string>; recebedores: Set<string> }>();
  for (const lote of lotes) {
    const docsNoLote = new Set(lote.itens.map((i) => normDoc(i.documentoNumero)).filter(Boolean));
    for (const doc of docsNoLote) {
      const e = porDesenho.get(doc) ?? { lotes: new Set<string>(), recebedores: new Set<string>() };
      e.lotes.add(lote.numero);
      e.recebedores.add(lote.recebedor);
      porDesenho.set(doc, e);
    }
  }

  for (const [docNum, info] of porDesenho) {
    if (info.lotes.size < 2) continue;
    const lotesArr = [...info.lotes];
    const temDuplicataMaterial = achados.some(
      (a) => a.codigo === 'LOTE_DUPLICADO_MATERIAL_DESENHO' && a.documentoNumero === docNum,
    );
    achados.push({
      severidade: temDuplicataMaterial ? 'critico' : 'alerta',
      codigo: 'DESENHO_MULTIPLOS_ATENDIMENTOS',
      titulo: 'Desenho com varios atendimentos concluidos',
      detalhe: `${docNum}: ${lotesArr.length} lote(s) — ${lotesArr.join(', ')}. Baixas parciais legitimas geram alerta; materiais repetidos geram critico.`,
      documentoNumero: docNum,
      loteNumeros: lotesArr,
      recebedores: [...info.recebedores],
    });
  }

  const somaHistoricoPorDocItem = new Map<string, number>();
  for (const lote of lotes) {
    for (const item of lote.itens) {
      const key = `${normDoc(item.documentoNumero)}|${codigoMaterialKey(item.codigoMaterial)}`;
      somaHistoricoPorDocItem.set(key, (somaHistoricoPorDocItem.get(key) ?? 0) + item.quantidadeAtendida);
    }
  }

  for (const raw of documentos) {
    if (!raw || typeof raw !== 'object') continue;
    const doc = raw as Record<string, unknown>;
    const docNum = normDoc(doc.numero);
    const itens = Array.isArray(doc.itens) ? doc.itens : [];
    for (const ir of itens) {
      if (!ir || typeof ir !== 'object') continue;
      const item = ir as Record<string, unknown>;
      const cod = codigoItem(item);
      const key = `${docNum}|${codigoMaterialKey(cod)}`;
      const somaLotes = somaHistoricoPorDocItem.get(key);
      if (somaLotes == null) continue;
      const qAt = qAtItem(item);
      if (Math.abs(somaLotes - qAt) > 0.05) {
        achados.push({
          severidade: 'alerta',
          codigo: 'DIVERGENCIA_LOTES_VS_PLANEJAMENTO',
          titulo: 'Soma dos lotes difere do atendido no desenho',
          detalhe: `${docNum} / ${cod}: lotes somam ${somaLotes.toFixed(3)}, planejamento marca ${qAt.toFixed(3)}.`,
          documentoNumero: docNum,
          codigoMaterial: cod,
          valorNumerico: somaLotes,
          valorEsperado: qAt,
        });
      }
    }
  }

  const criticos = achados.filter((a) => a.severidade === 'critico').length;
  const alertas = achados.filter((a) => a.severidade === 'alerta').length;
  const infos = achados.filter((a) => a.severidade === 'info').length;

  achados.sort((a, b) => {
    const ord = { critico: 0, alerta: 1, info: 2 };
    return ord[a.severidade] - ord[b.severidade] || a.documentoNumero?.localeCompare(b.documentoNumero ?? '') || 0;
  });

  return {
    geradoEm: new Date().toISOString(),
    snapshotUpdatedAt: opts?.snapshotUpdatedAt ?? null,
    resumo: {
      criticos,
      alertas,
      infos,
      documentosAuditados: documentos.length,
      lotesConcluidos: lotes.length,
      linhasPlanejamento,
    },
    achados,
    source: opts?.source ?? 'local',
    warning: null,
  };
}

export function relatorioIntegridadeParaCsv(relatorio: AtendimentoIntegridadeRelatorio): string {
  const header = [
    'severidade',
    'codigo',
    'titulo',
    'detalhe',
    'documento',
    'material',
    'lotes',
    'recebedores',
  ].join(';');
  const rows = relatorio.achados.map((a) =>
    [
      a.severidade,
      a.codigo,
      a.titulo,
      a.detalhe,
      a.documentoNumero ?? '',
      a.codigoMaterial ?? '',
      (a.loteNumeros ?? []).join(' | '),
      (a.recebedores ?? []).join(' | '),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(';'),
  );
  return [header, ...rows].join('\n');
}
