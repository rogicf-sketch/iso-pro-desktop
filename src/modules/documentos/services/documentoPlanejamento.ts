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

/**
 * Tolerância para comparações de quantidade decimal. IEEE 754 acumula erro em somas diferentes
 * (ex.: planejamento 312+7,8+7,5+3,1 pode ser 330,400…000003 enquanto recebimento 312+18,4 = 330,4).
 */
const QTD_PLANEJAMENTO_EPS = 1e-9;

/** `valor` cobre ou iguala `meta`, com margem numericamente segura. */
export function quantidadeAtingeOuSuperaPlanejamento(valor: number, meta: number): boolean {
  if (!(Number.isFinite(valor) && Number.isFinite(meta))) return false;
  return valor + QTD_PLANEJAMENTO_EPS >= meta;
}

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
  return quantidadeAtingeOuSuperaPlanejamento(atd, qtd);
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
  if (quantidadeAtingeOuSuperaPlanejamento(atendido, prevista)) return 'atendido';
  if (quantidadeAtingeOuSuperaPlanejamento(recebido, prevista)) return 'recebido';
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

  if (qtdLin > 0 && quantidadeAtingeOuSuperaPlanejamento(atendLin, qtdLin)) return 'atendido';
  if (receb <= 0) return 'pendente';
  const recebimentoCobrePlanejamento = quantidadeAtingeOuSuperaPlanejamento(receb, prev);
  if (!recebimentoCobrePlanejamento) return 'parcial';
  if (!quantidadeAtingeOuSuperaPlanejamento(atendGlob, prev)) return 'recebido';
  if (!quantidadeAtingeOuSuperaPlanejamento(atendLin, qtdLin)) return 'recebido';
  return calcularStatusMaterialPorMetricas(m);
}

/** Agregação do documento — usa o mesmo critério das linhas na lista/CSV (`resolverStatusLinhaDocumento`). */
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

  const statuses: StatusPlanejamentoMaterial[] = itens.map((item) =>
    resolverStatusLinhaDocumento(item, metricas),
  );

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

/**
 * Localizações distintas por código de material, a partir dos itens de recebimentos que entram no
 * planejamento de estoque (mesma regra de `montarMetricasPorCodigoMaterial` para inclusão da NF).
 * Vários recebimentos / linhas com o mesmo código são fundidos; endereços repetidos aparecem uma vez.
 */
export function montarLocalizacoesPorCodigoMaterial(recebimentos: Recebimento[]): Map<string, string> {
  const porCodigo = new Map<string, Set<string>>();
  for (const rec of recebimentos) {
    if (!recebimentoContaParaEstoquePlanejamento(rec)) continue;
    for (const item of rec.itens) {
      const cod = normalizeCodigoPlanejamento(item.codigoMaterial);
      if (!cod) continue;
      const loc = String(item.localizacao ?? '').trim();
      if (!loc) continue;
      let set = porCodigo.get(cod);
      if (!set) {
        set = new Set();
        porCodigo.set(cod, set);
      }
      set.add(loc);
    }
  }
  const out = new Map<string, string>();
  for (const [cod, set] of porCodigo) {
    const joined = [...set]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      .join(' | ');
    out.set(cod, joined);
  }
  return out;
}

/**
 * Texto mostrado na folha de campo (e na pré-visualização): prioriza endereços agregados dos recebimentos;
 * se ainda não houver nenhum para o código, usa o texto opcional do item do documento.
 */
export function resolverLocalizacaoExibicaoPlanejamento(
  item: DocumentoItem,
  localizacoesRecebimentoPorCodigo: Map<string, string> | undefined,
): string {
  const cod = normalizeCodigoPlanejamento(item.codigoMaterial);
  const fromRec =
    localizacoesRecebimentoPorCodigo && cod
      ? (localizacoesRecebimentoPorCodigo.get(cod) ?? '').trim()
      : '';
  if (fromRec) return fromRec;
  return (item.localizacao ?? '').trim();
}
