import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { resolveSotUnavailable } from './sotWriteGuard';
import { getSupabase, hasSupabaseConfig } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

/**
 * SoT table-first materiais: `public.materiais` + projeção snapshot (sem outbox).
 * Com `sot_require_rpc`: RPC ausente → hard-fail (sem dual-write silencioso).
 */
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

export async function writeMateriaisSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  upsert?: unknown[] | unknown | null;
  deleteIds?: string[] | null;
  replaceAll?: unknown[] | null;
  /** Aborta a espera da tela. A gravacao na nuvem pode ainda terminar. */
  timeoutMs?: number;
}): Promise<{ updatedAt: string; missing: boolean }> {
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'materiais', reason: 'supabase_unavailable' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'materiais', reason: 'supabase_unavailable' });
  }

  const chamada = supabase.rpc('iso_pro_write_materiais_sot', {
    p_tenant_id: getActiveTenantId(),
    p_baseline: opts.baselineUpdatedAt,
    p_upsert: opts.upsert ?? null,
    p_delete_ids: opts.deleteIds ?? null,
    p_replace_all: opts.replaceAll ?? null,
  }) as PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } =
    opts.timeoutMs && opts.timeoutMs > 0
      ? await comTempo(chamada, opts.timeoutMs, 'Tempo esgotado ao gravar na nuvem.')
      : await chamada;

  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({ domain: 'materiais', reason: 'rpc_missing', detail: error.message });
    }
    if (String(error.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT')) {
      throw new IsoProSnapshotConflictError(error.message);
    }
    throw new Error(error.message);
  }
  return { updatedAt: data != null ? String(data) : new Date().toISOString(), missing: false };
}
