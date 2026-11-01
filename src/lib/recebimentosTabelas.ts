import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { invalidateOperacaoContagensBestEffort } from './operacaoContagensCache';
import { resolveSotUnavailable } from './sotWriteGuard';
import { getSupabase, hasSupabaseConfig, rpcSemFilaAuth } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

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

  let lote = 0;
  for (const chunk of chunks) {
    lote += 1;
    options?.onProgress?.(lote, chunks.length);
    let lastError = 'Falha no upsert.';
    let saved = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      let data: unknown;
      let error: { message: string } | null = null;
      try {
        const chamada = supabase.rpc('iso_pro_upsert_recebimentos_lote', {
          p_tenant_id: getActiveTenantId(),
          p_recebimentos: chunk,
        }) as PromiseLike<{ data: unknown; error: { message: string } | null }>;
        const res = await comTempo(chamada, 45_000, 'Tempo esgotado ao gravar na nuvem.');
        data = res.data;
        error = res.error;
      } catch (err) {
        error = { message: err instanceof Error ? err.message : 'Tempo esgotado ao gravar na nuvem.' };
        data = null;
      }
      if (!error) {
        const row = (data ?? {}) as { ok?: boolean; recebimentos?: number; itens?: number; error?: string };
        if (row.ok !== false) {
          recs += Number(row.recebimentos) || 0;
          itens += Number(row.itens) || 0;
          saved = true;
          break;
        }
        lastError = row.error ?? lastError;
      } else {
        lastError = error.message;
      }
      const waitLock = lastError.toLowerCase().includes('lock timeout');
      const esgotado = lastError.toLowerCase().includes('tempo esgotado');
      if (esgotado || !waitLock || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
    if (!saved) return { ok: false, recebimentos: recs, itens, error: lastError };
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

/**
 * SoT table-first: grava tabelas + projecao no snapshot (RPC atomica).
 * Com `sot_require_rpc`: RPC ausente → hard-fail (sem patch snapshot).
 */
export async function writeRecebimentosSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  upsert?: unknown[] | null;
  removeIds?: string[] | null;
  replaceAll?: unknown[] | null;
}): Promise<{ updatedAt: string; missing: boolean }> {
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'recebimentos', reason: 'supabase_unavailable' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'recebimentos', reason: 'supabase_unavailable' });
  }

  const { data, error } = await supabase.rpc('iso_pro_write_recebimentos_sot', {
    p_tenant_id: getActiveTenantId(),
    p_baseline: opts.baselineUpdatedAt,
    p_upsert: opts.upsert ?? null,
    p_remove_ids: opts.removeIds?.length ? opts.removeIds : null,
    p_replace_all: opts.replaceAll ?? null,
  });

  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({
        domain: 'recebimentos',
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

export async function listRecebimentosPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
  modo?: string;
  signal?: AbortSignal;
}): Promise<{
  recebimentos: RecebimentoListWire[];
  total: number;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { recebimentos: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }

  // rpcSemFilaAuth: fora da fila Auth + timeout curto (NF não pode esperar 25s).
  const { data, error } = await rpcSemFilaAuth<{
    recebimentos?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  }>(
    'iso_pro_list_recebimentos_page',
    {
      p_tenant_id: getActiveTenantId(),
      p_busca: options?.busca?.trim() || null,
      p_offset: options?.offset ?? 0,
      p_limit: options?.limit ?? 50,
      p_status: options?.status && options.status !== 'todos' ? options.status : null,
      p_modo: options?.modo && options.modo !== 'todos' ? options.modo : null,
    },
    8_000,
    options?.signal,
  );
  if (error) return { recebimentos: [], total: 0, source: 'error', error };
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
  const { data, error } = await rpcSemFilaAuth<{
    recebimento?: RecebimentoWire | null;
    _source?: string;
    _error?: string;
  }>('iso_pro_read_recebimento', {
    p_tenant_id: getActiveTenantId(),
    p_recebimento_id: id,
  });
  if (error) return { recebimento: null, source: 'error', error };
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
