import {
  clearIsoProJwtSession,
  ensureIsoProDataSessionReadable,
} from './isoProJwtSession';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export const DOCUMENTOS_UPSERT_CHUNK_SIZE = 40;

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
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; documentos?: number; itens?: number; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha no sync.' };
  return { ok: true, documentos: Number(row.documentos) || 0, itens: Number(row.itens) || 0 };
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

  const chunkSize = options?.chunkSize ?? DOCUMENTOS_UPSERT_CHUNK_SIZE;
  const chunks = chunkArray(documentos, chunkSize);
  let docs = 0;
  let itens = 0;
  let done = 0;

  for (const chunk of chunks) {
    const { data, error } = await supabase.rpc('iso_pro_upsert_documentos_planejamento_lote', {
      p_tenant_id: getActiveTenantId(),
      p_documentos: chunk,
    });
    if (error) {
      return { ok: false, documentos: docs, itens, error: error.message };
    }
    const row = (data ?? {}) as { ok?: boolean; documentos?: number; itens?: number; error?: string };
    if (row.ok === false) {
      return { ok: false, documentos: docs, itens, error: row.error ?? 'Falha no upsert.' };
    }
    docs += Number(row.documentos) || 0;
    itens += Number(row.itens) || 0;
    done += chunk.length;
    options?.onProgress?.(done, documentos.length);
  }

  return { ok: true, documentos: docs, itens };
}

export async function listDocumentosPlanejamentoPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{
  documentos: Array<
    DocumentoPlanejamentoWire & {
      totalItens?: number;
      quantidadePlanejada?: number;
      quantidadeAtendida?: number;
      status?: string;
    }
  >;
  total: number;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documentos: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }

  await ensureIsoProDataSessionReadable();

  const invoke = async () => {
    const supabase = getSupabase();
    if (!supabase) return { data: null as unknown, error: { message: 'Supabase indisponivel.' } };
    return supabase.rpc('iso_pro_list_documentos_planejamento_page', {
      p_tenant_id: getActiveTenantId(),
      p_busca: options?.busca?.trim() || null,
      p_offset: options?.offset ?? 0,
      p_limit: options?.limit ?? 50,
      p_status: options?.status && options.status !== 'todos' ? options.status : null,
    });
  };

  let { data, error } = await invoke();

  const totalOf = (raw: unknown) => Number((raw as { total?: number } | null)?.total ?? 0);
  const sourceOf = (raw: unknown) => String((raw as { _source?: string } | null)?._source ?? '');

  const needsAnonRetry =
    (error && /ISO_PRO_TENANT_FORBIDDEN|ISO_PRO_TENANT_INVALID/i.test(String(error.message))) ||
    (!error && (totalOf(data) === 0 || sourceOf(data) === 'snapshot'));

  if (needsAnonRetry) {
    // Sessao Auth residual (mesmo sem flag) esconde linhas via RLS → seed local DOC-1001.
    await clearIsoProJwtSession();
    ({ data, error } = await invoke());
  }

  if (error) return { documentos: [], total: 0, source: 'error', error: error.message };
  const row = (data ?? {}) as {
    documentos?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  };
  if (row._error) return { documentos: [], total: 0, source: 'error', error: row._error };
  const list = Array.isArray(row.documentos)
    ? (row.documentos as Array<
        DocumentoPlanejamentoWire & {
          totalItens?: number;
          quantidadePlanejada?: number;
          quantidadeAtendida?: number;
          status?: string;
        }
      >)
    : [];
  return {
    documentos: list,
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
  };
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
