/**
 * Alinha quantidades atendidas nas linhas do planejamento com `atendimentos` e `atendimentoHistorico`
 * do snapshot — usado em Atendimento, Documentos e saldo operacional.
 *
 * Caso comum (mobile): `documentoId` no histórico vem vazio; cruzamos pelo número do documento (`documento`).
 */
import {
  buildSaldoMap,
  codigoMaterialKey,
  quantidadeAtendidaDaLinhaDocumento,
  type SaldoSnapshotPayload,
} from '../modules/estoque/saldoFromSnapshot';

export type DocumentoItemPlanejamentoStored = {
  id: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  quantidadeProjeto: number;
  quantidadeAtendida: number;
  /** Texto livre: uma ou varias posicoes de estoque para ajudar separacao no campo. */
  localizacao: string;
};

export type DocumentoPlanejamentoStored = {
  id: string;
  numero: string;
  revisao: string;
  descricao: string;
  responsavel: string;
  status: string;
  itens: DocumentoItemPlanejamentoStored[];
};

/** Payload mínimo do `iso_pro_snapshot` para reconciliar planejamento. */
export type PayloadPlanejamentoReconcile = {
  /**
   * Quando `tables`, `quantidadeAtendida` nos documentos ja veio das tabelas (SoT)
   * e nao deve ser elevada por historico/coluna stale (anti-ressurreicao pos-estorno).
   */
  _documentosSource?: 'tables' | 'snapshot' | string;
  documentos?: Array<{
    id?: string | number;
    numero?: string;
    revisao?: string;
    descricao?: string;
    responsavel?: string;
    status?: string;
    itens?: Array<{
      id?: string | number;
      codigo?: string;
      descricao?: string;
      unidade?: string;
      quantidade?: number | string;
      quantidadeAtendida?: number | string;
      quantidade_atendida?: number | string;
      localizacao?: string;
    }>;
  }>;
  atendimentos?: Array<{
    numero?: string;
    status?: string;
    itens?: Array<{
      documentoItemId?: string | number;
      quantidadeAtendida?: number | string;
    }>;
  }>;
  atendimentoHistorico?: Array<{
    id?: string | number;
    loteNumero?: string;
    documentoId?: string | number | null;
    documento?: string;
    documentoItemId?: string | number | null;
    codigo?: string;
    quantidade?: number | string;
  }>;
  /**
   * Log auditavel de estornos (PC/web). O estorno reduz `quantidadeAtendida` nos documentos,
   * mas as linhas antigas de `atendimentoHistorico` ficam na nuvem (o RPC so faz append).
   * Sem abater este log, a reconciliacao "ressuscitava" quantidades estornadas.
   */
  atendimentoEstornoLog?: Array<{
    loteNumero?: string;
    atendimentoItemId?: string | number;
    documentoNumero?: string;
    codigoMaterial?: string;
    quantidadeEstornada?: number | string;
  }>;
};

function normalizeRotuloDocumento(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function deriveDocumentoStatusPlanejamento(doc: DocumentoPlanejamentoStored): string {
  const total = doc.itens.length;
  let atendidos = 0;
  let pendentes = 0;
  for (const item of doc.itens) {
    if (item.quantidadeAtendida >= item.quantidadeProjeto) atendidos += 1;
    if (item.quantidadeAtendida <= 0) pendentes += 1;
  }
  if (!total || pendentes === total) return 'pendente';
  if (atendidos === total) return 'atendido';
  return 'parcial';
}

export function mapSnapshotDocumentosParaStored(payload: PayloadPlanejamentoReconcile): DocumentoPlanejamentoStored[] {
  return (payload.documentos ?? []).map((doc, index) => ({
    id: String(doc.id ?? `doc-${index + 1}`),
    numero: String(doc.numero ?? ''),
    revisao: String(doc.revisao ?? 'A'),
    descricao: String(doc.descricao ?? ''),
    responsavel: String(doc.responsavel ?? ''),
    status: String(doc.status ?? 'pendente'),
    itens: (doc.itens ?? []).map((item, itemIndex) => {
      const raw = item as { localizacao?: unknown; localização?: unknown };
      const loc = String(raw.localizacao ?? raw.localização ?? '').trim();
      return {
        id: String(item.id ?? `${doc.id ?? index}-item-${itemIndex + 1}`),
        codigoMaterial: String(item.codigo ?? ''),
        descricaoMaterial: String(item.descricao ?? ''),
        unidade: String(item.unidade ?? 'UN'),
        quantidadeProjeto: Number(item.quantidade ?? 0),
        quantidadeAtendida: quantidadeAtendidaDaLinhaDocumento(item),
        localizacao: loc,
      };
    }),
  }));
}

function indiceNumeroDocumentoParaId(documentos: DocumentoPlanejamentoStored[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of documentos) {
    const k = normalizeRotuloDocumento(d.numero);
    if (k && !m.has(k)) m.set(k, d.id);
  }
  return m;
}

/**
 * Soma por (documentoId, codigo) a partir do histórico, resolvendo `documentoId` pelo número do desenho quando vier vazio.
 */
function lotesEstornadosDoPayload(payload: PayloadPlanejamentoReconcile): Set<string> {
  const s = new Set<string>();
  for (const at of payload.atendimentos ?? []) {
    if (String(at.status) !== 'estornado') continue;
    const numero = String((at as { numero?: unknown }).numero ?? '').trim();
    if (numero) s.add(numero);
  }
  return s;
}

function somarHistoricoPorDocumentoECodigo(
  documentos: DocumentoPlanejamentoStored[],
  payload: PayloadPlanejamentoReconcile,
  lotesEstornados: Set<string>,
): Map<string, number> {
  const numeroParaId = indiceNumeroDocumentoParaId(documentos);
  const histByDocCod = new Map<string, number>();
  for (const raw of payload.atendimentoHistorico ?? []) {
    /** Linhas com `documentoItemId` (app móvel) são contadas por item — evita duplicar no FIFO. */
    if (String((raw as { documentoItemId?: unknown }).documentoItemId ?? '').trim()) {
      continue;
    }
    // Lote totalmente estornado: as linhas antigas ficam na nuvem (RPC append-only) mas nao contam.
    if (lotesEstornados.has(String(raw.loteNumero ?? '').trim())) continue;
    let docId = String(raw.documentoId ?? '').trim();
    if (!docId) {
      const rot = normalizeRotuloDocumento(String(raw.documento ?? ''));
      if (rot) docId = numeroParaId.get(rot) ?? '';
    }
    const cod = codigoMaterialKey(String(raw.codigo ?? ''));
    const q = Number(raw.quantidade ?? 0);
    if (!docId || !cod || !Number.isFinite(q) || q <= 0) continue;
    const k = `${docId}###${cod}`;
    histByDocCod.set(k, (histByDocCod.get(k) ?? 0) + q);
  }

  // Estornos parciais (lote continua 'concluido'): abate a quantidade estornada por doc+codigo.
  for (const raw of payload.atendimentoEstornoLog ?? []) {
    const lote = String(raw.loteNumero ?? '').trim();
    if (lote && lotesEstornados.has(lote)) continue; // linhas do lote ja foram ignoradas acima
    const rot = normalizeRotuloDocumento(String(raw.documentoNumero ?? ''));
    const docId = rot ? (numeroParaId.get(rot) ?? '') : '';
    const cod = codigoMaterialKey(String(raw.codigoMaterial ?? ''));
    const q = Number(raw.quantidadeEstornada ?? 0);
    if (!docId || !cod || !Number.isFinite(q) || q <= 0) continue;
    const k = `${docId}###${cod}`;
    const atual = histByDocCod.get(k);
    if (atual === undefined) continue;
    histByDocCod.set(k, Math.max(0, atual - q));
  }
  return histByDocCod;
}

function somarHistoricoPorDocumentoItemId(
  payload: PayloadPlanejamentoReconcile,
  lotesEstornados: Set<string>,
): Map<string, number> {
  const m = new Map<string, number>();
  /** rowId → documentoItemId, para abater estornos parciais (o log guarda o id do item do lote). */
  const rowParaDocItem = new Map<string, string>();
  for (const raw of payload.atendimentoHistorico ?? []) {
    const iid = String((raw as { documentoItemId?: unknown }).documentoItemId ?? '').trim();
    if (!iid) continue;
    if (lotesEstornados.has(String(raw.loteNumero ?? '').trim())) continue;
    const q = Number(raw.quantidade ?? 0);
    if (!Number.isFinite(q) || q <= 0) continue;
    m.set(iid, (m.get(iid) ?? 0) + q);
    const rowId = String(raw.id ?? '').trim();
    if (rowId) rowParaDocItem.set(rowId, iid);
  }
  for (const raw of payload.atendimentoEstornoLog ?? []) {
    const lote = String(raw.loteNumero ?? '').trim();
    if (lote && lotesEstornados.has(lote)) continue;
    const rowId = String(raw.atendimentoItemId ?? '').trim();
    const iid = rowId ? rowParaDocItem.get(rowId) : undefined;
    if (!iid) continue;
    const q = Number(raw.quantidadeEstornada ?? 0);
    if (!Number.isFinite(q) || q <= 0) continue;
    const atual = m.get(iid);
    if (atual === undefined) continue;
    m.set(iid, Math.max(0, atual - q));
  }
  return m;
}

export function reconciliarDocumentosComRegistrosDeAtendimento(
  documentos: DocumentoPlanejamentoStored[],
  payload: PayloadPlanejamentoReconcile,
): DocumentoPlanejamentoStored[] {
  const preferTables = String(payload._documentosSource ?? '').trim().toLowerCase() === 'tables';
  const structSum = new Map<string, number>();
  for (const at of payload.atendimentos ?? []) {
    if (String(at.status) === 'estornado') continue;
    for (const it of at.itens ?? []) {
      const id = String(it.documentoItemId ?? '').trim();
      if (!id) continue;
      const q = Number(it.quantidadeAtendida ?? 0);
      if (!Number.isFinite(q) || q <= 0) continue;
      structSum.set(id, (structSum.get(id) ?? 0) + q);
    }
  }

  const lotesEstornados = lotesEstornadosDoPayload(payload);
  const histByDocCod = preferTables
    ? new Map<string, number>()
    : somarHistoricoPorDocumentoECodigo(documentos, payload, lotesEstornados);
  const histPorItemId = preferTables
    ? new Map<string, number>()
    : somarHistoricoPorDocumentoItemId(payload, lotesEstornados);

  return documentos.map((doc) => {
    const did = String(doc.id);
    const itens = doc.itens.map((it) => {
      const qSnap = Math.max(0, Number(it.quantidadeAtendida) || 0);
      const qSt = structSum.get(it.id) ?? 0;
      const qHistItem = histPorItemId.get(it.id) ?? 0;
      // Tabelas = SoT: nao elevar com historico/coluna (evita ressuscitar estorno).
      const qa = preferTables ? qSnap : Math.max(qSnap, qSt, qHistItem);
      const proj = Math.max(0, Number(it.quantidadeProjeto) || 0);
      return { ...it, quantidadeAtendida: Math.min(proj, qa) };
    });

    const nextItens = [...itens];
    const byCod = new Map<string, number[]>();
    nextItens.forEach((it, idx) => {
      const cod = codigoMaterialKey(it.codigoMaterial);
      const arr = byCod.get(cod) ?? [];
      arr.push(idx);
      byCod.set(cod, arr);
    });

    for (const [codKey, indices] of byCod) {
      const k = `${did}###${codKey}`;
      const H = histByDocCod.get(k) ?? 0;
      if (H <= 1e-12) continue;
      let alloc = 0;
      for (const idx of indices) {
        alloc += Math.max(0, Number(nextItens[idx]?.quantidadeAtendida) || 0);
      }
      let extra = H - alloc;
      if (extra <= 1e-9) continue;
      for (const idx of indices) {
        if (extra <= 1e-9) break;
        const it = nextItens[idx];
        if (!it) continue;
        const proj = Math.max(0, Number(it.quantidadeProjeto) || 0);
        let qa = Math.max(0, Number(it.quantidadeAtendida) || 0);
        const room = Math.max(0, proj - qa);
        const take = Math.min(room, extra);
        qa += take;
        extra -= take;
        nextItens[idx] = { ...it, quantidadeAtendida: qa };
      }
    }

    const merged: DocumentoPlanejamentoStored = {
      ...doc,
      itens: nextItens,
      status: deriveDocumentoStatusPlanejamento({ ...doc, itens: nextItens }),
    };
    return merged;
  });
}

export function documentosReconciliadosDoPayload(payload: PayloadPlanejamentoReconcile): DocumentoPlanejamentoStored[] {
  const base = mapSnapshotDocumentosParaStored(payload);
  return reconciliarDocumentosComRegistrosDeAtendimento(base, payload);
}

export function montarSaldoPayloadComDocumentosReconciliados(
  raw: PayloadPlanejamentoReconcile & Record<string, unknown>,
  reconciledDocs: DocumentoPlanejamentoStored[],
): SaldoSnapshotPayload {
  return {
    ...raw,
    documentos: reconciledDocs.map((doc) => ({
      id: doc.id,
      itens: doc.itens.map((it) => ({
        codigo: it.codigoMaterial,
        descricao: it.descricaoMaterial,
        unidade: it.unidade,
        quantidade: it.quantidadeProjeto,
        quantidadeAtendida: it.quantidadeAtendida,
      })),
    })),
  };
}

/** Para testes ou chamadas que já têm o payload completo do snapshot. */
export function buildSaldoMapComPlanejamentoReconciliado(
  raw: PayloadPlanejamentoReconcile & Record<string, unknown>,
): Map<string, number> {
  const rec = documentosReconciliadosDoPayload(raw);
  return buildSaldoMap(montarSaldoPayloadComDocumentosReconciliados(raw, rec));
}
