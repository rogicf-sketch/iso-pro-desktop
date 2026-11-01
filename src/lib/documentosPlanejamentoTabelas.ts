import { ensureIsoProDataSessionReadable } from './isoProJwtSession';
import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { fetchAllPagesFromSupabaseParallel } from './fetchAllSupabasePages';
import { fetchAllExportRpcPages, fetchAllExportCsvChunks } from './exportRpcPages';
import { invalidateOperacaoContagensBestEffort } from './operacaoContagensCache';
import { resolveSotUnavailable } from './sotWriteGuard';
import { getSupabase, hasSupabaseConfig, restGetSemFilaAuth, rpcComJwtSemFila, rpcSemFilaAuth } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

function comTempo<T>(promise: PromiseLike<T>, timeoutMs: number, mensagem: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensagem)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(mensagem));
      },
    );
  });
}

/** Tecto de desenhos por envio. Importação normal agrupa até este número ou até o volume de itens. */
export const DOCUMENTOS_UPSERT_CHUNK_SIZE = 2000;
/** Um envio enquanto as linhas de item do lote couberem aqui (qualquer tamanho de ficheiro parte em poucos envios). */
export const DOCUMENTOS_UPSERT_MAX_ITENS = 2000;

export type DocumentoPlanejamentoWire = {
  id: string | number;
  numero?: string;
  revisao?: string;
  data?: string;
  descricao?: string;
  responsavel?: string;
  status?: string;
  observacao?: string;
  itens?: Array<{
    id?: string | number;
    codigo?: string;
    descricao?: string;
    unidade?: string;
    quantidade?: number;
    quantidadeAtendida?: number;
    localizacao?: string;
  }>;
};

function chunkDocumentosPorVolume(documentos: DocumentoPlanejamentoWire[]): DocumentoPlanejamentoWire[][] {
  const chunks: DocumentoPlanejamentoWire[][] = [];
  let cur: DocumentoPlanejamentoWire[] = [];
  let itens = 0;
  for (const doc of documentos) {
    const n = Math.max(1, doc.itens?.length ?? 0);
    const estoura =
      cur.length > 0 &&
      (cur.length >= DOCUMENTOS_UPSERT_CHUNK_SIZE || itens + n > DOCUMENTOS_UPSERT_MAX_ITENS);
    if (estoura) {
      chunks.push(cur);
      cur = [];
      itens = 0;
    }
    cur.push(doc);
    itens += n;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Sincroniza snapshot → tabelas (activar escala / reparar). */
export async function syncDocumentosPlanejamentoFromSnapshot(): Promise<{
  ok: boolean;
  documentos?: number;
  itens?: number;
  error?: string;
}> {
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_sync_documentos_planejamento_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  invalidateDocumentosListaCabIndex();
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; documentos?: number; itens?: number; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha no sync.' };
  return { ok: true, documentos: Number(row.documentos) || 0, itens: Number(row.itens) || 0 };
}

/**
 * SoT table-first: substitui documentos nas tabelas (preserva qAt) + projecao snapshot.
 * Com `sot_require_rpc`: RPC ausente → hard-fail.
 */
export async function writeDocumentosSotOnCloud(opts: {
  documentos: DocumentoPlanejamentoWire[];
  baselineUpdatedAt: string | null;
  atendimentoHistorico?: unknown;
  atendimentos?: unknown;
}): Promise<{ updatedAt: string; missing: boolean }> {
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'documentos', reason: 'supabase_unavailable' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'documentos', reason: 'supabase_unavailable' });
  }

  const chamada = supabase.rpc('iso_pro_write_documentos_sot', {
    p_tenant_id: getActiveTenantId(),
    p_documentos: opts.documentos,
    p_baseline: opts.baselineUpdatedAt,
    p_atendimento_historico: opts.atendimentoHistorico ?? null,
    p_atendimentos: opts.atendimentos ?? null,
  }) as PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await comTempo(chamada, 120_000, 'Tempo esgotado ao gravar na nuvem.');

  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({
        domain: 'documentos',
        reason: 'rpc_missing',
        detail: error.message,
      });
    }
    if (String(error.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT')) {
      throw new IsoProSnapshotConflictError(error.message);
    }
    throw new Error(error.message);
  }
  invalidateOperacaoContagensBestEffort();
  return { updatedAt: data != null ? String(data) : new Date().toISOString(), missing: false };
}

/** Dual-write / import chunked para tabelas dedicadas. */
export async function upsertDocumentosPlanejamentoEmLotes(
  documentos: DocumentoPlanejamentoWire[],
  options?: { chunkSize?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ ok: boolean; documentos: number; itens: number; error?: string }> {
  if (!hasSupabaseConfig()) return { ok: false, documentos: 0, itens: 0, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, documentos: 0, itens: 0, error: 'Supabase indisponivel.' };
  if (!documentos.length) return { ok: true, documentos: 0, itens: 0 };

  const chunks =
    options?.chunkSize != null
      ? chunkArray(documentos, options.chunkSize)
      : chunkDocumentosPorVolume(documentos);
  let docs = 0;
  let itens = 0;
  let lote = 0;

  for (const chunk of chunks) {
    lote += 1;
    options?.onProgress?.(lote, chunks.length);
    let data: unknown;
    let error: { message: string } | null = null;
    try {
      const chamada = supabase.rpc('iso_pro_upsert_documentos_planejamento_lote', {
        p_tenant_id: getActiveTenantId(),
        p_documentos: chunk,
      }) as PromiseLike<{ data: unknown; error: { message: string } | null }>;
      const res = await comTempo(chamada, 45_000, 'Tempo esgotado ao gravar na nuvem.');
      data = res.data;
      error = res.error;
    } catch (err) {
      error = { message: err instanceof Error ? err.message : 'Tempo esgotado ao gravar na nuvem.' };
      data = null;
    }
    if (error) {
      return { ok: false, documentos: docs, itens, error: error.message };
    }
    const row = (data ?? {}) as { ok?: boolean; documentos?: number; itens?: number; error?: string };
    if (row.ok === false) {
      return { ok: false, documentos: docs, itens, error: row.error ?? 'Falha no upsert.' };
    }
    docs += Number(row.documentos) || 0;
    itens += Number(row.itens) || 0;
  }

  invalidateOperacaoContagensBestEffort();
  return { ok: true, documentos: docs, itens };
}

/**
 * Status de planejamento alinhado ao detalhe para os IDs da página (set-based).
 * Com persist=true corrige a coluna stale (ex.: Pendente com material já Recebido).
 */
export async function fetchStatusDocumentosPlanejamentoLote(
  ids: string[],
  persist = true,
): Promise<{ porId: Map<string, string>; error?: string }> {
  const out = new Map<string, string>();
  const clean = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))].slice(0, 100);
  if (!clean.length || !hasSupabaseConfig()) return { porId: out };
  await ensureIsoProDataSessionReadable();
  const supabase = getSupabase();
  if (!supabase) return { porId: out, error: 'Supabase indisponivel para alinhar status.' };
  const { data, error } = await supabase.rpc('iso_pro_status_documentos_planejamento_lote', {
    p_tenant_id: getActiveTenantId(),
    p_ids: clean,
    p_persist: persist,
  });
  if (error) return { porId: out, error: error.message };
  const body = (data ?? {}) as { porId?: Record<string, unknown>; _error?: string };
  if (body._error) return { porId: out, error: body._error };
  if (!body.porId || typeof body.porId !== 'object') {
    return { porId: out, error: 'Resposta de status da lista invalida.' };
  }
  for (const [id, st] of Object.entries(body.porId)) {
    const s = String(st ?? '').trim().toLowerCase();
    if (!id || !s) continue;
    out.set(id, s);
  }
  return { porId: out };
}

type DocumentoListaPageRow = DocumentoPlanejamentoWire & {
  totalItens?: number;
  quantidadePlanejada?: number;
  quantidadeAtendida?: number;
  status?: string;
};

type ListaSeek = { numero: string; id: string };

type ListaPageBookmark = { first: ListaSeek; last: ListaSeek };

/** Bookmarks por filtro — salto 1→900 e ±1 sem OFFSET a 200k desenhos. */
const listaPageBookmarks = new Map<string, Map<number, ListaPageBookmark>>();

function listaBookmarkFilterKey(tenantId: string, busca: string, status: string, limit: number): string {
  return `${tenantId}\u0001${busca}\u0001${status}\u0001${limit}`;
}

function rememberListaPageBookmark(
  filterKey: string,
  page: number,
  docs: DocumentoListaPageRow[],
): void {
  if (page < 1 || docs.length === 0) return;
  const firstId = String(docs[0]?.id ?? '').trim();
  const firstNumero = String(docs[0]?.numero ?? '');
  const last = docs[docs.length - 1]!;
  const lastId = String(last.id ?? '').trim();
  const lastNumero = String(last.numero ?? '');
  if (!firstId || !lastId) return;
  let byPage = listaPageBookmarks.get(filterKey);
  if (!byPage) {
    byPage = new Map();
    listaPageBookmarks.set(filterKey, byPage);
  }
  byPage.set(page, {
    first: { numero: firstNumero, id: firstId },
    last: { numero: lastNumero, id: lastId },
  });
}

/** PostgREST: aspas + escape — numeros tipo WAR-12"-PT… partiam o filtro e o keyset caía no OFFSET lento. */
function quotePostgrestFilterValue(value: string): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '""')}"`;
}

function encodePostgrestOrKeysetAfter(seek: ListaSeek): string {
  const n = encodeURIComponent(quotePostgrestFilterValue(seek.numero));
  const id = encodeURIComponent(seek.id);
  // (numero > n) OR (numero = n AND id > id)
  return `or=(numero.gt.${n},and(numero.eq.${n},id.gt.${id}))`;
}

type DocCabRest = {
  id?: string;
  numero?: string | null;
  revisao?: string | null;
  descricao?: string | null;
  responsavel?: string | null;
  data_documento?: string | null;
  status?: string | null;
};

function baseListaFilters(
  tenantId: string,
  statusRaw: string,
  busca: string,
): string[] | null {
  const parts = [`tenant_id=eq.${encodeURIComponent(tenantId)}`];
  if (statusRaw) parts.push(`status=ilike.${encodeURIComponent(statusRaw)}`);
  if (busca) {
    const safe = busca.replace(/[%*,()]/g, ' ').trim();
    if (!safe) return null;
    const enc = encodeURIComponent(`*${safe}*`);
    parts.push(`or=(numero.ilike.${enc},descricao.ilike.${enc},responsavel.ilike.${enc})`);
  }
  return parts;
}

const listaTotalMem = new Map<string, { at: number; total: number }>();
const LISTA_TOTAL_TTL_MS = 120_000;

async function fetchListaTotalCached(
  tenantId: string,
  busca: string,
  statusRaw: string,
  offset: number,
  limit: number,
  pageLen: number,
): Promise<number> {
  const memKey = `${tenantId}\u0001${busca}\u0001${statusRaw || 'todos'}`;
  const cached = listaTotalMem.get(memKey);
  if (cached && Date.now() - cached.at < LISTA_TOTAL_TTL_MS && cached.total > 0) {
    return cached.total;
  }
  if (!busca && !statusRaw) {
    const cont = await restGetSemFilaAuth<Array<{ documentos_planejamento?: number | null }>>(
      `iso_pro_tenant_contagens?tenant_id=eq.${encodeURIComponent(tenantId)}&select=documentos_planejamento`,
      2_500,
    );
    const n = Number(cont.data?.[0]?.documentos_planejamento) || 0;
    if (n > 0) {
      listaTotalMem.set(memKey, { at: Date.now(), total: n });
      return n;
    }
  }
  const approx = pageLen >= limit ? offset + limit + 1 : offset + pageLen;
  if (approx > 0) listaTotalMem.set(memKey, { at: Date.now(), total: approx });
  return approx;
}

/** Até aqui OFFSET+RPC cobrem o tenant típico (6k–20k). Acima: keyset/ids. */
const LISTA_OFFSET_SIMPLES_MAX = 20_000;
/** Orçamento curto: RPC sem agg de itens deve responder em <2s; senão REST cab. */
const LISTA_RPC_TIMEOUT_MS = 6_000;
const LISTA_REST_FALLBACK_MS = 4_000;

function mapCabRestToListaRows(docs: DocCabRest[]): DocumentoListaPageRow[] {
  return docs.map((d) => ({
    id: String(d.id ?? ''),
    numero: String(d.numero ?? ''),
    revisao: String(d.revisao ?? 'A') || 'A',
    descricao: String(d.descricao ?? ''),
    responsavel: String(d.responsavel ?? ''),
    data: String(d.data_documento ?? '').slice(0, 10),
    status: String(d.status ?? 'pendente').trim() || 'pendente',
    // Sem hidratar itens aqui — status da coluna basta; RPC já traz quantidades.
    totalItens: 0,
    quantidadePlanejada: 0,
    quantidadeAtendida: 0,
    itens: [],
  }));
}

/**
 * REST rápido (só cabeçalhos, sem agregado de itens).
 * Usado como fallback curto se o RPC falhar — não pode demorar dezenas de segundos.
 */
async function listDocumentosPlanejamentoPageViaRest(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
  page?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ documentos: DocumentoListaPageRow[]; total: number } | null> {
  const tenantId = getActiveTenantId();
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const page = Math.max(1, options?.page ?? Math.floor(offset / limit) + 1);
  const busca = (options?.busca ?? '').trim();
  const statusRaw =
    options?.status && options.status !== 'todos' ? options.status.trim().toLowerCase() : '';
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? LISTA_REST_FALLBACK_MS;

  const filterPartsRaw = baseListaFilters(tenantId, statusRaw, busca);
  if (!filterPartsRaw) return null;
  const filterParts: string[] = filterPartsRaw;

  const filterKey = listaBookmarkFilterKey(tenantId, busca, statusRaw || 'todos', limit);
  const byPage = listaPageBookmarks.get(filterKey);
  const prevBm = byPage?.get(page - 1) ?? null;

  const table = 'iso_pro_documentos_planejamento';
  const selectFull = 'id,numero,revisao,descricao,responsavel,data_documento,status';
  const orderAsc = 'order=numero.asc,id.asc';

  async function fetchBySimpleOffset(off: number): Promise<DocCabRest[] | null> {
    const q =
      `${table}?` +
      [...filterParts, `select=${selectFull}`, orderAsc, `offset=${off}`, `limit=${limit}`].join('&');
    const res = await restGetSemFilaAuth<DocCabRest[]>(q, timeoutMs, signal);
    if (res.error || !Array.isArray(res.data)) return null;
    return res.data;
  }

  async function fetchByKeyset(after: ListaSeek): Promise<DocCabRest[] | null> {
    const q =
      `${table}?` +
      [
        ...filterParts,
        `select=${selectFull}`,
        orderAsc,
        encodePostgrestOrKeysetAfter(after),
        `limit=${limit}`,
      ].join('&');
    const res = await restGetSemFilaAuth<DocCabRest[]>(q, Math.min(timeoutMs, 5_000), signal);
    if (res.error || !Array.isArray(res.data) || res.data.length === 0) return null;
    return res.data;
  }

  let rawDocs: DocCabRest[] | null = null;

  if (offset < LISTA_OFFSET_SIMPLES_MAX) {
    rawDocs = await fetchBySimpleOffset(offset);
  } else if (page > 1 && !busca && prevBm) {
    rawDocs = await fetchByKeyset(prevBm.last);
  }

  if (!rawDocs && offset >= LISTA_OFFSET_SIMPLES_MAX) {
    const idQ =
      `${table}?` +
      [...filterParts, 'select=id,numero', orderAsc, `offset=${offset}`, `limit=${limit}`].join('&');
    const idRes = await restGetSemFilaAuth<Array<{ id?: string; numero?: string | null }>>(
      idQ,
      timeoutMs,
      signal,
    );
    if (!idRes.error && Array.isArray(idRes.data) && idRes.data.length > 0) {
      const ids = idRes.data.map((r) => String(r.id ?? '').trim()).filter(Boolean);
      const fullQ =
        `${table}?` +
        [
          `tenant_id=eq.${encodeURIComponent(tenantId)}`,
          `id=in.(${ids.join(',')})`,
          `select=${selectFull}`,
        ].join('&');
      const fullRes = await restGetSemFilaAuth<DocCabRest[]>(fullQ, Math.min(timeoutMs, 5_000), signal);
      if (!fullRes.error && Array.isArray(fullRes.data)) {
        const byId = new Map(fullRes.data.map((d) => [String(d.id ?? ''), d]));
        rawDocs = ids.map((id) => byId.get(id)).filter(Boolean) as DocCabRest[];
      }
    }
  }

  if (!rawDocs) return null;

  const documentos = mapCabRestToListaRows(rawDocs);
  rememberListaPageBookmark(filterKey, page, documentos);
  const total = await fetchListaTotalCached(tenantId, busca, statusRaw, offset, limit, documentos.length);
  return { documentos, total };
}

/** Índice de cabeçalhos em RAM — com ≤25k desenhos a paginação é local (instantânea). */
const CAB_INDEX_MAX = 25_000;
const CAB_INDEX_TTL_MS = 5 * 60_000;

type CabIndexMem = { tenantId: string; at: number; rows: DocumentoListaPageRow[] };

let cabIndexMem: CabIndexMem | null = null;
let cabIndexInflight: Promise<CabIndexMem | null> | null = null;

export function invalidateDocumentosListaCabIndex(): void {
  cabIndexMem = null;
  cabIndexInflight = null;
  listaPageBookmarks.clear();
  listaTotalMem.clear();
}

function filterCabIndexRows(
  rows: DocumentoListaPageRow[],
  busca: string,
  statusRaw: string,
): DocumentoListaPageRow[] {
  let out = rows;
  if (statusRaw) {
    const s = statusRaw.toLowerCase();
    out = out.filter((r) => String(r.status ?? '').trim().toLowerCase() === s);
  }
  const q = busca.trim().toLowerCase();
  if (q) {
    out = out.filter((r) => {
      const n = String(r.numero ?? '').toLowerCase();
      const d = String(r.descricao ?? '').toLowerCase();
      const resp = String(r.responsavel ?? '').toLowerCase();
      return n.includes(q) || d.includes(q) || resp.includes(q);
    });
  }
  return out;
}

async function ensureDocumentosListaCabIndex(
  signal?: AbortSignal,
): Promise<CabIndexMem | null> {
  const tenantId = getActiveTenantId();
  if (
    cabIndexMem &&
    cabIndexMem.tenantId === tenantId &&
    Date.now() - cabIndexMem.at < CAB_INDEX_TTL_MS &&
    cabIndexMem.rows.length > 0
  ) {
    return cabIndexMem;
  }

  // Não cancelar a carga do índice quando o React Query aborta ao mudar de página.
  if (!cabIndexInflight) {
    cabIndexInflight = (async () => {
      const cont = await restGetSemFilaAuth<Array<{ documentos_planejamento?: number | null }>>(
        `iso_pro_tenant_contagens?tenant_id=eq.${encodeURIComponent(tenantId)}&select=documentos_planejamento`,
        2_500,
      );
      const n = Number(cont.data?.[0]?.documentos_planejamento) || 0;
      // Acima de 25k: manter paginação servidor (200k+). Abaixo: índice local profissional.
      if (n > CAB_INDEX_MAX) return null;

      const table = 'iso_pro_documentos_planejamento';
      const selectFull = 'id,numero,revisao,descricao,responsavel,data_documento,status';
      const raw = await fetchAllPagesFromSupabaseParallel<DocCabRest>(
        async (off, pageSize) => {
          const q =
            `${table}?tenant_id=eq.${encodeURIComponent(tenantId)}` +
            `&select=${selectFull}&order=numero.asc,id.asc&offset=${off}&limit=${pageSize}`;
          const res = await restGetSemFilaAuth<DocCabRest[]>(q, 15_000);
          if (res.error || !Array.isArray(res.data)) {
            throw new Error(res.error || 'Falha ao carregar indice da lista.');
          }
          return res.data;
        },
        1_000,
        6,
      );

      const rows = mapCabRestToListaRows(raw);
      cabIndexMem = { tenantId, at: Date.now(), rows };
      listaTotalMem.set(`${tenantId}\u0001\u0001todos`, { at: Date.now(), total: rows.length });
      return cabIndexMem;
    })()
      .catch(() => null)
      .finally(() => {
        cabIndexInflight = null;
      });
  }

  const inflight = cabIndexInflight;
  if (!inflight) return cabIndexMem;
  if (!signal) return inflight;

  return new Promise<CabIndexMem | null>((resolve, reject) => {
    if (signal.aborted) {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      reject(err);
      return;
    }
    const onAbort = () => {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      reject(err);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void inflight.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

async function listDocumentosPlanejamentoPageViaRpc(
  options: {
    busca?: string;
    offset?: number;
    limit?: number;
    status?: string;
    page: number;
    signal?: AbortSignal;
  },
): Promise<{ documentos: DocumentoListaPageRow[]; total: number } | null> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit ?? 50;
  const { data, error } = await rpcSemFilaAuth<{
    documentos?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  }>(
    'iso_pro_list_documentos_planejamento_page',
    {
      p_tenant_id: getActiveTenantId(),
      p_busca: options.busca?.trim() || null,
      p_offset: offset,
      p_limit: limit,
      p_status: options.status && options.status !== 'todos' ? options.status : 'todos',
    },
    LISTA_RPC_TIMEOUT_MS,
    options.signal,
  );
  if (error || !data || (data as { _error?: string })._error) return null;
  const list = Array.isArray(data.documentos) ? (data.documentos as DocumentoListaPageRow[]) : [];
  const tenantId = getActiveTenantId();
  const busca = (options.busca ?? '').trim();
  const statusRaw =
    options.status && options.status !== 'todos' ? options.status.trim().toLowerCase() : '';
  rememberListaPageBookmark(
    listaBookmarkFilterKey(tenantId, busca, statusRaw || 'todos', limit),
    options.page,
    list,
  );
  return { documentos: list, total: Number(data.total) || 0 };
}

export async function listDocumentosPlanejamentoPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
  page?: number;
  signal?: AbortSignal;
}): Promise<{
  documentos: DocumentoListaPageRow[];
  total: number;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documentos: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }
  if (options?.signal?.aborted) {
    return { documentos: [], total: 0, source: 'error', error: 'AbortError' };
  }

  const page =
    options?.page ??
    (options?.limit ? Math.floor((options.offset ?? 0) / Math.max(options.limit, 1)) + 1 : 1);
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const busca = (options?.busca ?? '').trim();
  const statusRaw =
    options?.status && options.status !== 'todos' ? options.status.trim().toLowerCase() : '';

  // Probe de saúde (limit 1): não carregar 6k cabeçalhos.
  const probeOnly = limit <= 1 && offset === 0 && !busca && !statusRaw;

  // Padrão profissional ≤25k: 1 carga de cabeçalhos → páginas locais instantâneas.
  if (!probeOnly) {
    try {
      const index = await ensureDocumentosListaCabIndex(options?.signal);
      if (index) {
        const filtered = filterCabIndexRows(index.rows, busca, statusRaw);
        const slice = filtered.slice(offset, offset + limit);
        rememberListaPageBookmark(
          listaBookmarkFilterKey(getActiveTenantId(), busca, statusRaw || 'todos', limit),
          page,
          slice,
        );
        return { documentos: slice, total: filtered.length, source: 'tables' };
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { documentos: [], total: 0, source: 'error', error: 'AbortError' };
      }
      // Cai no RPC/REST abaixo.
    }
  }

  // Tenants enormes / falha do índice: RPC + REST (legado).
  if (offset < LISTA_OFFSET_SIMPLES_MAX) {
    try {
      const viaRpc = await listDocumentosPlanejamentoPageViaRpc({
        busca: options?.busca,
        offset,
        limit: options?.limit,
        status: options?.status,
        page,
        signal: options?.signal,
      });
      if (viaRpc) {
        return { documentos: viaRpc.documentos, total: viaRpc.total, source: 'tables' };
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { documentos: [], total: 0, source: 'error', error: 'AbortError' };
      }
    }
  }

  try {
    const viaRest = await listDocumentosPlanejamentoPageViaRest({
      ...options,
      page,
      signal: options?.signal,
      timeoutMs: LISTA_REST_FALLBACK_MS,
    });
    if (viaRest) {
      return { documentos: viaRest.documentos, total: viaRest.total, source: 'tables' };
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { documentos: [], total: 0, source: 'error', error: 'AbortError' };
    }
    throw e;
  }

  return {
    documentos: [],
    total: 0,
    source: 'error',
    error: 'Nao foi possivel carregar esta página. Tente de novo.',
  };
}

/** Contagens leves nas tabelas de escala — evita descarregar o snapshot JSON inteiro na lista. */
export async function countDocumentosPlanejamentoTabelas(): Promise<{
  documentos: number;
  itens: number;
  documentosComItens: number;
  ok: boolean;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documentos: -1, itens: -1, documentosComItens: -1, ok: false, error: 'Supabase nao configurado.' };
  }
  await ensureIsoProDataSessionReadable();
  const supabase = getSupabase();
  if (!supabase) {
    return { documentos: -1, itens: -1, documentosComItens: -1, ok: false, error: 'Supabase indisponivel.' };
  }
  const tenantId = getActiveTenantId();
  const [docs, itens] = await Promise.all([
    supabase
      .from('iso_pro_documentos_planejamento')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('iso_pro_documento_itens_planejamento')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);
  if (docs.error || itens.error) {
    return {
      documentos: -1,
      itens: -1,
      documentosComItens: -1,
      ok: false,
      error: docs.error?.message || itens.error?.message || 'Falha nas contagens.',
    };
  }
  const nDocs = docs.count ?? 0;
  const nItens = itens.count ?? 0;
  // Aproximacao segura para o aviso «nuvem sem linhas»: se ha itens, ha desenhos com material.
  const documentosComItens = nItens > 0 ? Math.min(nDocs, nItens) : 0;
  return { documentos: nDocs, itens: nItens, documentosComItens, ok: true };
}

export async function listDocumentosPlanejamentoIdsFromCloud(options?: {
  busca?: string;
  status?: string;
}): Promise<{ ids: string[]; source: string; error?: string }> {
  if (!hasSupabaseConfig()) {
    return { ids: [], source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { ids: [], source: 'none', error: 'Supabase indisponivel.' };

  const { data, error } = await supabase.rpc('iso_pro_list_documentos_planejamento_ids', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
  });
  if (error) return { ids: [], source: 'error', error: error.message };
  const row = (data ?? {}) as { ids?: unknown; _source?: string; _error?: string };
  if (row._error) return { ids: [], source: 'error', error: row._error };
  const raw = Array.isArray(row.ids) ? row.ids : [];
  const ids = raw.map((x) => String(x ?? '').trim()).filter(Boolean);
  return { ids, source: String(row._source ?? 'tables') };
}

type DocPlanejamentoRow = {
  id: string;
  numero: string | null;
  revisao: string | null;
  data_documento: string | null;
  descricao: string | null;
  responsavel: string | null;
  status: string | null;
  observacao: string | null;
};

type DocItemPlanejamentoRow = {
  documento_id: string;
  id: string;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  quantidade_atendida: number | null;
  localizacao: string | null;
};

/**
 * Índice leve do planejamento (sem itens) — baseline rápido para import CSV/JSON.
 * Evita descarregar ~4k desenhos com milhares de linhas só para saber id/status.
 */
export async function listAllDocumentosPlanejamentoIndiceFromCloud(): Promise<{
  documentos: Array<{ id: string; numero: string; revisao: string; status: string }>;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documentos: [], source: 'none', error: 'Supabase nao configurado.' };
  }
  await ensureIsoProDataSessionReadable();
  const supabase = getSupabase();
  if (!supabase) return { documentos: [], source: 'none', error: 'Supabase indisponivel.' };
  const tenantId = getActiveTenantId();

  try {
    type Row = { id: string; numero: string | null; revisao: string | null; status: string | null };
    const rows = await fetchAllPagesFromSupabaseParallel<Row>(async (offset, pageSize) => {
      const { data, error } = await supabase
        .from('iso_pro_documentos_planejamento')
        .select('id,numero,revisao,status')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    });
    return {
      documentos: rows.map((d) => ({
        id: String(d.id ?? ''),
        numero: String(d.numero ?? ''),
        revisao: String(d.revisao ?? 'A') || 'A',
        status: String(d.status ?? 'pendente') || 'pendente',
      })),
      source: 'tables',
    };
  } catch (e) {
    return {
      documentos: [],
      source: 'error',
      error: e instanceof Error ? e.message : 'Falha ao ler indice do planejamento.',
    };
  }
}

/**
 * Catálogo completo SoT (tabelas) com itens — usado quando o snapshot omite a fatia `documentos`
 * (modo table-first). Sem isto, import/export partiam de lista vazia e podiam apagar a nuvem.
 */
export async function listAllDocumentosPlanejamentoCompletosFromCloud(): Promise<{
  documentos: DocumentoPlanejamentoWire[];
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documentos: [], source: 'none', error: 'Supabase nao configurado.' };
  }
  await ensureIsoProDataSessionReadable();
  const supabase = getSupabase();
  if (!supabase) return { documentos: [], source: 'none', error: 'Supabase indisponivel.' };
  const tenantId = getActiveTenantId();

  try {
    const [docs, itens] = await Promise.all([
      fetchAllPagesFromSupabaseParallel<DocPlanejamentoRow>(async (offset, pageSize) => {
        const { data, error } = await supabase
          .from('iso_pro_documentos_planejamento')
          .select('id,numero,revisao,data_documento,descricao,responsavel,status,observacao')
          .eq('tenant_id', tenantId)
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        return (data ?? []) as DocPlanejamentoRow[];
      }),
      fetchAllPagesFromSupabaseParallel<DocItemPlanejamentoRow>(async (offset, pageSize) => {
        const { data, error } = await supabase
          .from('iso_pro_documento_itens_planejamento')
          .select('documento_id,id,codigo,descricao,unidade,quantidade,quantidade_atendida,localizacao')
          .eq('tenant_id', tenantId)
          .order('documento_id', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        return (data ?? []) as DocItemPlanejamentoRow[];
      }),
    ]);

    const itensByDoc = new Map<string, DocumentoPlanejamentoWire['itens']>();
    for (const it of itens) {
      const docId = String(it.documento_id ?? '').trim();
      if (!docId) continue;
      const list = itensByDoc.get(docId) ?? [];
      list.push({
        id: String(it.id ?? ''),
        codigo: String(it.codigo ?? ''),
        descricao: String(it.descricao ?? ''),
        unidade: String(it.unidade ?? 'UN') || 'UN',
        quantidade: Number(it.quantidade) || 0,
        quantidadeAtendida: Number(it.quantidade_atendida) || 0,
        localizacao: String(it.localizacao ?? '').trim(),
      });
      itensByDoc.set(docId, list);
    }

    const documentos: DocumentoPlanejamentoWire[] = docs.map((d) => {
      const id = String(d.id ?? '');
      return {
        id,
        numero: String(d.numero ?? ''),
        revisao: String(d.revisao ?? 'A'),
        data: d.data_documento != null ? String(d.data_documento).slice(0, 10) : undefined,
        descricao: String(d.descricao ?? ''),
        responsavel: String(d.responsavel ?? ''),
        status: d.status != null ? String(d.status) : undefined,
        observacao: String(d.observacao ?? ''),
        itens: itensByDoc.get(id) ?? [],
      };
    });

    return { documentos, source: 'tables' };
  } catch (e) {
    return {
      documentos: [],
      source: 'error',
      error: e instanceof Error ? e.message : 'Falha ao ler planejamento das tabelas.',
    };
  }
}

export type CabecalhoDocumentoPlanejamento = {
  numero: string;
  revisao: string;
  descricao: string;
  responsavel: string;
};

function textoCabecalho(value: unknown): string {
  return String(value ?? '').trim();
}

/** Várias revisões do mesmo número: prefere a que tem descrição. */
export function escolherCabecalhoDocumento(
  rows: CabecalhoDocumentoPlanejamento[],
): CabecalhoDocumentoPlanejamento | null {
  const limpos = rows
    .map((row) => ({
      numero: textoCabecalho(row.numero),
      revisao: textoCabecalho(row.revisao),
      descricao: textoCabecalho(row.descricao),
      responsavel: textoCabecalho(row.responsavel),
    }))
    .filter((row) => row.numero || row.revisao || row.descricao || row.responsavel);
  if (limpos.length === 0) return null;
  return limpos.find((row) => row.descricao) ?? limpos[0] ?? null;
}

/**
 * Só descrição, revisão e responsável. O recibo já traz as linhas da baixa;
 * não baixa o desenho inteiro.
 */
export async function lerCabecalhoDocumentoPlanejamento(opts: {
  id?: string | null;
  numero?: string | null;
}): Promise<CabecalhoDocumentoPlanejamento | null> {
  if (!hasSupabaseConfig()) return null;
  const id = String(opts.id ?? '').trim();
  const numero = String(opts.numero ?? '').trim();
  if (!id && !numero) return null;

  const query = new URLSearchParams();
  query.set('select', 'numero,revisao,descricao,responsavel');
  query.set('tenant_id', `eq.${getActiveTenantId()}`);
  if (id) query.set('id', `eq.${id}`);
  else query.set('numero', `eq.${numero}`);
  query.set('limit', '8');

  const { data, error } = await restGetSemFilaAuth<CabecalhoDocumentoPlanejamento[]>(
    `iso_pro_documentos_planejamento?${query.toString()}`,
    8_000,
  );
  if (error || !Array.isArray(data)) return null;
  return escolherCabecalhoDocumento(data);
}

/**
 * Leitura de um desenho (com itens) — tabelas SoT primeiro (RPC).
 * Usado quando a lista veio das tabelas mas o snapshot/coluna esta stale.
 */
export async function readDocumentoPlanejamentoFromCloud(opts: {
  id?: string | null;
  numero?: string | null;
  revisao?: string | null;
}): Promise<{
  documento: DocumentoPlanejamentoWire | null;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documento: null, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { documento: null, source: 'none', error: 'Supabase indisponivel.' };

  const id = String(opts.id ?? '').trim();
  const numero = String(opts.numero ?? '').trim();
  if (!id && !numero) return { documento: null, source: 'none', error: 'id ou numero obrigatorio.' };

  const { data, error } = await supabase.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: getActiveTenantId(),
    p_documento_id: id || null,
    p_numero: id ? null : numero || null,
    p_revisao: opts.revisao?.trim() || null,
  });
  if (error) return { documento: null, source: 'error', error: error.message };
  const row = (data ?? {}) as {
    documento?: DocumentoPlanejamentoWire | null;
    _source?: string;
    _error?: string;
  };
  if (row._error) return { documento: null, source: 'error', error: row._error };
  if (!row.documento || typeof row.documento !== 'object') {
    return { documento: null, source: String(row._source ?? 'tables') };
  }
  return { documento: row.documento, source: String(row._source ?? 'tables') };
}

export type DocumentoExportItemRow = {
  documento_id: string;
  numero: string;
  revisao: string;
  descricao_documento: string;
  responsavel: string;
  data_documento: string;
  status_documento: string;
  item_id: string;
  codigo_material: string;
  descricao_material: string;
  unidade: string;
  quantidade_documento: number;
  quantidade_atendida: number;
  localizacao_planejamento: string;
};

const EXPORT_ITENS_PAGE_SIZE = 5000;

/** CSV base_v2: documento_id;item_id;numero;…;localizacao (14 cols). */
function parseCsvLineSemicolon(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ';') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseDecimalPtCsv(raw: string): number {
  const t = raw.trim().replace(',', '.');
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Converte chunks CSV base_v2 (leve) em linhas tipadas para enriquecimento no cliente. */
export function parseExportDocumentosItensCsvBaseV2(chunks: string[]): DocumentoExportItemRow[] {
  const rows: DocumentoExportItemRow[] = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      const c = parseCsvLineSemicolon(line);
      if (c.length < 14) continue;
      rows.push({
        documento_id: c[0] ?? '',
        item_id: c[1] ?? '',
        numero: c[2] ?? '',
        revisao: c[3] ?? '',
        descricao_documento: c[4] ?? '',
        responsavel: c[5] ?? '',
        data_documento: c[6] ?? '',
        status_documento: c[7] ?? '',
        codigo_material: c[8] ?? '',
        descricao_material: c[9] ?? '',
        unidade: c[10] ?? '',
        quantidade_documento: parseDecimalPtCsv(c[11] ?? ''),
        quantidade_atendida: parseDecimalPtCsv(c[12] ?? ''),
        localizacao_planejamento: c[13] ?? '',
      });
    }
  }
  return rows;
}

/**
 * Linhas planas para Excel/CSV via RPC (páginas até 5000, ondas paralelas).
 * Prefere CSV leve (base_v2); fallback para JSON.
 */
export async function listExportDocumentosItensRowsFromCloud(): Promise<{
  rows: DocumentoExportItemRow[];
  source: string;
  error?: string;
  missingRpc?: boolean;
}> {
  if (!hasSupabaseConfig()) {
    return { rows: [], source: 'none', error: 'Supabase nao configurado.', missingRpc: true };
  }
  await ensureIsoProDataSessionReadable();
  const supabase = getSupabase();
  if (!supabase) return { rows: [], source: 'none', error: 'Supabase indisponivel.', missingRpc: true };

  const tenantId = getActiveTenantId();

  // CSV leve base_v2 (sem sonda extra). Se vier, NÃO cair no JSON — isso duplicava ~20s.
  const csv = await fetchAllExportCsvChunks({
    supabase,
    rpcName: 'iso_pro_export_documentos_itens_csv_page',
    tenantId,
    pageSize: EXPORT_ITENS_PAGE_SIZE,
    waveConcurrency: 6,
  });
  if (!csv.missingRpc && !csv.error && csv.format === 'base_v2') {
    const rows = parseExportDocumentosItensCsvBaseV2(csv.chunks);
    if (rows.length > 0 || csv.rowCount === 0) {
      return { rows, source: `${csv.source}+csv_base_v2` };
    }
  }

  const result = await fetchAllExportRpcPages<DocumentoExportItemRow>({
    supabase,
    rpcName: 'iso_pro_export_documentos_itens_page',
    tenantId,
    pageSize: EXPORT_ITENS_PAGE_SIZE,
    waveConcurrency: 6,
  });
  return {
    rows: result.rows,
    source: result.source,
    error: result.error,
    missingRpc: result.missingRpc,
  };
}

/** CSV final no servidor (1 pedido) — exportar tudo ou filtro (busca/status). */
export async function listExportDocumentosCsvFinalFromCloud(options?: {
  busca?: string;
  status?: string;
}): Promise<{
  chunk: string;
  rowCount: number;
  source: string;
  error?: string;
  missingRpc?: boolean;
}> {
  if (!hasSupabaseConfig()) {
    return { chunk: '', rowCount: 0, source: 'none', error: 'Supabase nao configurado.', missingRpc: true };
  }
  const status = String(options?.status ?? 'todos').trim() || 'todos';
  const args = {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_status: status === 'todos' ? 'todos' : status,
  };
  type ExportBody = {
    chunk?: string;
    n?: number;
    _source?: string;
    _error?: string;
    _format?: string;
  };
  // Fora da fila de sessao: o Excel de ~45 mil linhas segurava essa fila e a tela ficava ~1 min.
  const direct = await rpcComJwtSemFila<ExportBody>('iso_pro_export_documentos_itens_csv_all', args, 90_000);
  let data: ExportBody | null = direct.data;
  let errorMessage = direct.error;
  if (direct.skipped || (errorMessage && /JWT|401|PGRST301|invalid claim/i.test(errorMessage))) {
    await ensureIsoProDataSessionReadable();
    const supabase = getSupabase();
    if (!supabase) {
      return { chunk: '', rowCount: 0, source: 'none', error: 'Supabase indisponivel.', missingRpc: true };
    }
    const queued = await supabase.rpc('iso_pro_export_documentos_itens_csv_all', args);
    data = (queued.data ?? null) as ExportBody | null;
    errorMessage = queued.error?.message ?? null;
  }
  if (errorMessage) {
    const missing = /function .* does not exist|PGRST202|404|could not find the function/i.test(errorMessage);
    return { chunk: '', rowCount: 0, source: 'missing', error: errorMessage, missingRpc: missing };
  }
  const body = (data ?? {}) as {
    chunk?: string;
    n?: number;
    _source?: string;
    _error?: string;
    _format?: string;
  };
  if (body._error) {
    return { chunk: '', rowCount: 0, source: 'error', error: body._error };
  }
  if (String(body._format ?? '') !== 'final_v1') {
    return { chunk: '', rowCount: 0, source: 'missing', error: 'formato inesperado', missingRpc: true };
  }
  return {
    chunk: typeof body.chunk === 'string' ? body.chunk : '',
    rowCount: Number(body.n) || 0,
    source: String(body._source ?? 'tables'),
  };
}
