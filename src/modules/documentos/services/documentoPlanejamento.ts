import type { Recebimento, RecebimentoItem } from '../../recebimentos/types/recebimento.types';
import type { Documento, DocumentoItem } from '../types/documento.types';

/** Status de uma linha ou agregação por código de material (compatível com o planejamento legado). */
export type StatusPlanejamentoMaterial = 'pendente' | 'parcial' | 'recebido' | 'atendido';

export function normalizeCodigoPlanejamento(value: string): string {
  return value.trim().toLowerCase();
}

export type MetricasPorCodigoMaterial = {
  prevista: number;
  recebido: number;
  atendido: number;
};

function recebimentoContaParaEstoquePlanejamento(rec: Recebimento): boolean {
  if (rec.status === 'cancelado' || rec.status === 'rascunho') return false;
  if (rec.modoRecebimento === 'direto') return true;
  return rec.status === 'conferido' || rec.status === 'parcialmente_conferido' || rec.status === 'divergente';
}

function quantidadeItemParaEstoquePlanejamento(rec: Recebimento, item: RecebimentoItem): number {
  if (!recebimentoContaParaEstoquePlanejamento(rec)) return 0;
  if (rec.modoRecebimento === 'direto') {
    return Math.max(0, Number(item.quantidadeRecebida) || 0);
  }
  const qc = item.quantidadeConferida;
  if (qc !== undefined && qc !== null && Number.isFinite(Number(qc))) {
    return Math.max(0, Number(qc));
  }
  return Math.max(0, Number(item.quantidadeRecebida) || 0);
}

function linhaDocumentoTotalmenteAtendida(item: DocumentoItem): boolean {
  const qtd = Number(item.quantidadeProjeto) || 0;
  if (qtd <= 0) return true;
  const atd = Number(item.quantidadeAtendida) || 0;
  return atd + 1e-9 >= qtd;
}

/** Soma quantidades planejadas e atendidas por código em todos os documentos não cancelados. */
export function montarMetricasPorCodigoMaterial(
  documentos: Documento[],
  recebimentos: Recebimento[],
): Map<string, MetricasPorCodigoMaterial> {
  const map = new Map<string, MetricasPorCodigoMaterial>();

  for (const doc of documentos) {
    if (doc.status === 'cancelado') continue;
    for (const item of doc.itens) {
      const cod = normalizeCodigoPlanejamento(item.codigoMaterial);
      if (!cod) continue;
      const cur = map.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      cur.prevista += Number(item.quantidadeProjeto) || 0;
      cur.atendido += Number(item.quantidadeAtendida) || 0;
      map.set(cod, cur);
    }
  }

  for (const rec of recebimentos) {
    if (!recebimentoContaParaEstoquePlanejamento(rec)) continue;
    for (const item of rec.itens) {
      const cod = normalizeCodigoPlanejamento(item.codigoMaterial);
      if (!cod) continue;
      const cur = map.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      cur.recebido += quantidadeItemParaEstoquePlanejamento(rec, item);
      map.set(cod, cur);
    }
  }

  return map;
}

/** Regra global por código (mesmo material em vários documentos), como no sistema legado. */
export function calcularStatusMaterialPorMetricas(m: MetricasPorCodigoMaterial): StatusPlanejamentoMaterial {
  const { prevista, recebido, atendido } = m;
  if (prevista <= 0) return 'pendente';
  if (atendido >= prevista) return 'atendido';
  if (recebido >= prevista) return 'recebido';
  if (recebido > 0) return 'parcial';
  return 'pendente';
}

/** Status da linha no documento (prioriza baixa da linha e depois estoque global). */
export function resolverStatusLinhaDocumento(
  item: DocumentoItem,
  metricas: Map<string, MetricasPorCodigoMaterial>,
): StatusPlanejamentoMaterial {
  const cod = normalizeCodigoPlanejamento(item.codigoMaterial);
  const m = metricas.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
  const atendLin = Number(item.quantidadeAtendida) || 0;
  const qtdLin = Number(item.quantidadeProjeto) || 0;
  const { prevista: prev, recebido: receb, atendido: atendGlob } = m;

  if (qtdLin > 0 && atendLin >= qtdLin) return 'atendido';
  if (receb <= 0) return 'pendente';
  if (receb < prev) return 'parcial';
  if (receb >= prev && atendGlob < prev) return 'recebido';
  if (receb >= prev && atendLin < qtdLin) return 'recebido';
  return calcularStatusMaterialPorMetricas(m);
}

/** Agregação do documento (igual à lista de documentos do HTML legado). */
export function resolverStatusDocumentoPlanejamento(
  doc: Documento,
  metricas: Map<string, MetricasPorCodigoMaterial>,
): Documento['status'] {
  if (doc.status === 'cancelado') return 'cancelado';
  const itens = doc.itens;
  if (!itens.length) return 'pendente';

  if (itens.every((item) => linhaDocumentoTotalmenteAtendida(item))) {
    return 'atendido';
  }

  const statuses: StatusPlanejamentoMaterial[] = itens.map((item) => {
    const cod = normalizeCodigoPlanejamento(item.codigoMaterial);
    const m = metricas.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
    return calcularStatusMaterialPorMetricas(m);
  });

  const all = (s: StatusPlanejamentoMaterial) => statuses.every((x) => x === s);
  if (all('atendido')) return 'atendido';
  if (statuses.every((x) => x === 'recebido' || x === 'atendido')) return 'recebido';
  if (all('pendente')) return 'pendente';
  return 'parcial';
}

export function aplicarStatusPlanejamentoEmDocumentos(
  documentos: Documento[],
  recebimentos: Recebimento[],
): Documento[] {
  const metricas = montarMetricasPorCodigoMaterial(documentos, recebimentos);
  return documentos.map((doc) =>
    doc.status === 'cancelado' ? doc : { ...doc, status: resolverStatusDocumentoPlanejamento(doc, metricas) },
  );
}
