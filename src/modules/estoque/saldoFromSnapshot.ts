/**
 * Saldo por codigo de material a partir do snapshot I.S.O PRO (nuvem):
 * recebimentos (direto = qtd NF; aguardando conferencia = so entra apos conferido) menos atendimentos em documentos + ajustes.
 * Opcional: saldo explicito no array materiais do snapshot faz max(explicito, calculado).
 */
import { normalizeCodigoPlanejamento } from '../documentos/services/documentoPlanejamento';

const ESTOQUE_AJUSTES_KEY = 'iso-pro-desktop-estoque-ajustes';

function readJsonLocal<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

/** Mesma regra do atendimento / planejamento: trim + minusculas. */
export function codigoMaterialKey(codigo: string): string {
  return normalizeCodigoPlanejamento(String(codigo ?? ''));
}

export type SaldoSnapshotPayload = {
  materiais?: Array<{
    id?: string | number;
    codigo?: string;
    descricao?: string;
    unidade?: string;
    saldoAtual?: number | string | null;
  }>;
  documentos?: Array<{
    id?: string | number;
    itens?: Array<{
      id?: string | number;
      codigo?: string;
      descricao?: string;
      unidade?: string;
      quantidade?: number | string;
      quantidadeAtendida?: number | string;
    }>;
  }>;
  recebimentos?: Array<{
    modoRecebimento?: 'direto' | 'aguardando_conferencia';
    statusConferencia?: 'pendente' | 'conferido' | null;
    /** Se presente no JSON (ex.: extensoes futuras), recebimentos cancelados nao entram no saldo. */
    status?: string;
    itens?: Array<{
      codigo?: string;
      quantidade?: number | string;
      quantidadeConferida?: number | string | null;
    }>;
  }>;
  estoqueAjustes?: Array<{
    codigo?: string;
    delta?: number | string | null;
  }>;
};

export function getQuantidadeRecebida(
  item: { quantidade?: number | string; quantidadeConferida?: number | string | null },
  modo: string,
  status?: string | null,
): number {
  if (modo === 'direto') {
    return Number(item.quantidade ?? 0);
  }
  return status === 'conferido' ? Number(item.quantidadeConferida ?? 0) : 0;
}

function modoRecebimentoDoSnapshot(rec: Record<string, unknown>): string {
  const raw = rec.modoRecebimento ?? rec.modo_recebimento ?? 'direto';
  const t = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (t === 'aguardando_conferencia' || t === 'conferencia' || t === 'aguardando') {
    return 'aguardando_conferencia';
  }
  return 'direto';
}

function statusConferenciaDoSnapshot(rec: Record<string, unknown>): string | null {
  const s = rec.statusConferencia ?? rec.status_conferencia;
  if (s === undefined || s === null || String(s).trim() === '') return null;
  return String(s).trim().toLowerCase() === 'conferido' ? 'conferido' : 'pendente';
}

function itemRecebimentoLinha(item: Record<string, unknown>): {
  codigo: string;
  quantidade?: number | string;
  quantidadeConferida?: number | string | null;
} {
  const codigo =
    item.codigo ??
    item.codigo_material ??
    item.codigoMaterial ??
    '';
  const quantidade =
    item.quantidade ?? item.quantidade_recebida ?? item.quantidadeRecebida ?? item.qtd;
  const quantidadeConferida = item.quantidadeConferida ?? item.quantidade_conferida;
  return {
    codigo: String(codigo ?? ''),
    quantidade: quantidade as number | string | undefined,
    quantidadeConferida: quantidadeConferida as number | string | null | undefined,
  };
}

export function buildSaldoMap(payload: SaldoSnapshotPayload): Map<string, number> {
  const recebimentosMap = new Map<string, number>();
  for (const rawRec of payload.recebimentos ?? []) {
    const rec = rawRec as Record<string, unknown>;
    if (String(rec.status ?? '').toLowerCase() === 'cancelado') {
      continue;
    }
    const modo = modoRecebimentoDoSnapshot(rec);
    const status = statusConferenciaDoSnapshot(rec);
    const itens = (Array.isArray(rec.itens) ? rec.itens : []) as Record<string, unknown>[];
    for (const rawItem of itens) {
      const item = itemRecebimentoLinha(rawItem);
      const codigo = codigoMaterialKey(item.codigo);
      if (!codigo) continue;
      const atual = recebimentosMap.get(codigo) ?? 0;
      recebimentosMap.set(codigo, atual + getQuantidadeRecebida(item, modo, status));
    }
  }

  const atendidoMap = new Map<string, number>();
  for (const documento of payload.documentos ?? []) {
    for (const raw of documento.itens ?? []) {
      const item = raw as Record<string, unknown>;
      const codigoRaw = item.codigo ?? item.codigo_material ?? item.codigoMaterial ?? '';
      const codigo = codigoMaterialKey(String(codigoRaw ?? ''));
      if (!codigo) continue;
      const qAt = item.quantidadeAtendida ?? item.quantidade_atendida;
      const atual = atendidoMap.get(codigo) ?? 0;
      atendidoMap.set(codigo, atual + Number(qAt ?? 0));
    }
  }

  const ajustesMap = new Map<string, number>();
  const localAjustes = readJsonLocal<{ codigo?: string; delta?: number | string | null }>(ESTOQUE_AJUSTES_KEY);
  for (const ajuste of [...(payload.estoqueAjustes ?? []), ...localAjustes]) {
    const codigo = codigoMaterialKey(String(ajuste.codigo ?? ''));
    if (!codigo) continue;
    const atual = ajustesMap.get(codigo) ?? 0;
    ajustesMap.set(codigo, atual + Number(ajuste.delta ?? 0));
  }

  const explicitPorCodigo = new Map<string, number>();
  for (const material of payload.materiais ?? []) {
    const codigo = codigoMaterialKey(String(material.codigo ?? ''));
    if (!codigo) continue;
    const rawSaldo = material.saldoAtual;
    const hasExplicit =
      rawSaldo !== undefined &&
      rawSaldo !== null &&
      String(rawSaldo).trim() !== '' &&
      !Number.isNaN(Number(rawSaldo));
    if (hasExplicit) {
      explicitPorCodigo.set(codigo, Math.max(0, Number(rawSaldo)));
    }
  }

  const todosCodigos = new Set<string>();
  for (const k of recebimentosMap.keys()) todosCodigos.add(k);
  for (const k of atendidoMap.keys()) todosCodigos.add(k);
  for (const k of ajustesMap.keys()) todosCodigos.add(k);
  for (const k of explicitPorCodigo.keys()) todosCodigos.add(k);
  for (const material of payload.materiais ?? []) {
    const c = codigoMaterialKey(String(material.codigo ?? ''));
    if (c) todosCodigos.add(c);
  }

  const saldoMap = new Map<string, number>();
  for (const codigo of todosCodigos) {
    const saldoCalculado = Math.max(
      0,
      (recebimentosMap.get(codigo) ?? 0) - (atendidoMap.get(codigo) ?? 0) + (ajustesMap.get(codigo) ?? 0),
    );
    const explicit = explicitPorCodigo.get(codigo);
    if (explicit !== undefined) {
      saldoMap.set(codigo, Math.max(explicit, saldoCalculado));
    } else {
      saldoMap.set(codigo, saldoCalculado);
    }
  }

  return saldoMap;
}
