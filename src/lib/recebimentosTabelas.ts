import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export const RECEBIMENTOS_UPSERT_CHUNK_SIZE = 40;

export type RecebimentoWire = {
  id: string | number;
  fornecedor?: string;
  fornecedorNome?: string;
  dataRecebimento?: string;
  data?: string;
  notaFiscal?: string;
  nota?: string;
  romaneio?: string;
  conferente?: string;
  conferenteNome?: string;
  modoRecebimento?: string;
  status?: string;
  statusConferencia?: string;
  observacoes?: string;
  dataConferencia?: string;
  itens?: Array<{
    id?: string | number;
    codigoMaterial?: string;
    codigo?: string;
    descricaoMaterial?: string;
    descricao?: string;
    unidade?: string;
    disciplina?: string;
    localizacao?: string;
    quantidadeRecebida?: number;
    quantidade?: number;
    quantidadeConferida?: number;
    pesoUnitario?: number;
    pesoTotal?: number;
    certificado?: string;
    observacaoItem?: string;
  }>;
};

export type RecebimentoListWire = {
  id: string;
  fornecedor?: string;
  dataRecebimento?: string;
  notaFiscal?: string;
  romaneio?: string;
  conferente?: string;
  modoRecebimento?: string;
  status?: string;
  dataConferencia?: string | null;
  totalItens?: number;
  quantidadeRecebidaTotal?: number;
  quantidadeConferidaTotal?: number;
  conferenciaItensDivergentes?: number;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function syncRecebimentosFromSnapshot(): Promise<{
  ok: boolean;
  recebimentos?: number;
  itens?: number;
  error?: string;
}> {
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_sync_recebimentos_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; recebimentos?: number; itens?: number; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha no sync.' };
  return {
    ok: true,
    recebimentos: Number(row.recebimentos) || 0,
    itens: Number(row.itens) || 0,
  };
}

export async function upsertRecebimentosEmLotes(
  recebimentos: RecebimentoWire[],
  options?: { chunkSize?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ ok: boolean; recebimentos: number; itens: number; error?: string }> {
  if (!hasSupabaseConfig()) {
    return { ok: false, recebimentos: 0, itens: 0, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { ok: false, recebimentos: 0, itens: 0, error: 'Supabase indisponivel.' };
  if (!recebimentos.length) return { ok: true, recebimentos: 0, itens: 0 };

  const chunkSize = options?.chunkSize ?? RECEBIMENTOS_UPSERT_CHUNK_SIZE;
  const chunks = chunkArray(recebimentos, chunkSize);
  let recs = 0;
  let itens = 0;
  let done = 0;

  for (const chunk of chunks) {
    const { data, error } = await supabase.rpc('iso_pro_upsert_recebimentos_lote', {
      p_tenant_id: getActiveTenantId(),
      p_recebimentos: chunk,
    });
    if (error) return { ok: false, recebimentos: recs, itens, error: error.message };
    const row = (data ?? {}) as { ok?: boolean; recebimentos?: number; itens?: number; error?: string };
    if (row.ok === false) {
      return { ok: false, recebimentos: recs, itens, error: row.error ?? 'Falha no upsert.' };
    }
    recs += Number(row.recebimentos) || 0;
    itens += Number(row.itens) || 0;
    done += chunk.length;
    options?.onProgress?.(done, recebimentos.length);
  }

  return { ok: true, recebimentos: recs, itens };
}

export async function deleteRecebimentosFromTables(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!ids.length) return { ok: true };
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_delete_recebimentos', {
    p_tenant_id: getActiveTenantId(),
    p_ids: ids,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha ao apagar.' };
  return { ok: true };
}

export async function listRecebimentosPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
  modo?: string;
}): Promise<{
  recebimentos: RecebimentoListWire[];
  total: number;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { recebimentos: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { recebimentos: [], total: 0, source: 'none', error: 'Supabase indisponivel.' };

  const { data, error } = await supabase.rpc('iso_pro_list_recebimentos_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
    p_modo: options?.modo && options.modo !== 'todos' ? options.modo : null,
  });
  if (error) return { recebimentos: [], total: 0, source: 'error', error: error.message };
  const row = (data ?? {}) as {
    recebimentos?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  };
  if (row._error) return { recebimentos: [], total: 0, source: 'error', error: row._error };
  const list = Array.isArray(row.recebimentos) ? (row.recebimentos as RecebimentoListWire[]) : [];
  return {
    recebimentos: list,
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
  };
}

export async function listRecebimentosIdsFromCloud(options?: {
  busca?: string;
  status?: string;
  modo?: string;
}): Promise<{ ids: string[]; source: string; error?: string }> {
  if (!hasSupabaseConfig()) {
    return { ids: [], source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { ids: [], source: 'none', error: 'Supabase indisponivel.' };

  const { data, error } = await supabase.rpc('iso_pro_list_recebimentos_ids', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
    p_modo: options?.modo && options.modo !== 'todos' ? options.modo : null,
  });
  if (error) return { ids: [], source: 'error', error: error.message };
  const row = (data ?? {}) as { ids?: unknown; _source?: string; _error?: string };
  if (row._error) return { ids: [], source: 'error', error: row._error };
  const raw = Array.isArray(row.ids) ? row.ids : [];
  return {
    ids: raw.map((x) => String(x ?? '').trim()).filter(Boolean),
    source: String(row._source ?? 'tables'),
  };
}

export async function readRecebimentoFromCloud(id: string): Promise<{
  recebimento: RecebimentoWire | null;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { recebimento: null, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { recebimento: null, source: 'none', error: 'Supabase indisponivel.' };

  const { data, error } = await supabase.rpc('iso_pro_read_recebimento', {
    p_tenant_id: getActiveTenantId(),
    p_recebimento_id: id,
  });
  if (error) return { recebimento: null, source: 'error', error: error.message };
  const row = (data ?? {}) as {
    recebimento?: RecebimentoWire | null;
    _source?: string;
    _error?: string;
  };
  if (row._error) return { recebimento: null, source: 'error', error: row._error };
  return {
    recebimento: row.recebimento ?? null,
    source: String(row._source ?? 'tables'),
  };
}
