import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { isFeatureEnabled } from './isoProFeatureFlags';
import { getActiveTenantId } from './isoProTenant';
import { invalidateOperacaoContagensBestEffort } from './operacaoContagensCache';
import { newTraceId, recordSotFallback } from './sotFallbackTelemetry';
import { resolveSotUnavailable } from './sotWriteGuard';
import { getSupabase, hasSupabaseConfig } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

export type WriteSotResult = {
  updatedAt: string;
  missing: boolean;
  idempotentHit?: boolean;
  traceId?: string;
};

/**
 * SoT table-first RIR: tabelas + projecao snapshot (sem outbox).
 * Com `sot_require_rpc` (default): RPC ausente → hard-fail (sem patch snapshot).
 * Com flag off: `missing: true` → cliente pode usar legado (emergência).
 */
export async function writeRirSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  upsert?: unknown[] | null;
  removeIds?: string[] | null;
  replaceAll?: unknown[] | null;
  idempotencyKey?: string | null;
  traceId?: string;
}): Promise<WriteSotResult> {
  const traceId = opts.traceId ?? newTraceId('rir');
  if (!isFeatureEnabled('sot_rir_rnc')) {
    // Intencional: desligar domínio RIR/RNC SoT → legado permitido.
    recordSotFallback({ domain: 'rir', reason: 'feature_flag_disabled', traceId });
    return { updatedAt: new Date().toISOString(), missing: true, traceId };
  }
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'rir', reason: 'supabase_unavailable', traceId });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'rir', reason: 'supabase_unavailable', traceId });
  }
  const { data, error } = await supabase.rpc('iso_pro_write_rir_sot', {
    p_tenant_id: getActiveTenantId(),
    p_baseline: opts.baselineUpdatedAt,
    p_upsert: opts.upsert ?? null,
    p_remove_ids: opts.removeIds?.length ? opts.removeIds : null,
    p_replace_all: opts.replaceAll ?? null,
    p_idempotency_key: opts.idempotencyKey?.trim() || null,
  });
  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({
        domain: 'rir',
        reason: 'rpc_missing',
        detail: error.message,
        traceId,
      });
    }
    if (String(error.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT')) {
      throw new IsoProSnapshotConflictError(error.message);
    }
    throw new Error(error.message);
  }
  invalidateOperacaoContagensBestEffort();
  return { updatedAt: data != null ? String(data) : new Date().toISOString(), missing: false, traceId };
}

/** SoT table-first RNC (idempotency_key opcional). */
export async function writeRncSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  upsert?: unknown[] | null;
  removeIds?: string[] | null;
  replaceAll?: unknown[] | null;
  idempotencyKey?: string | null;
  traceId?: string;
}): Promise<WriteSotResult> {
  const traceId = opts.traceId ?? newTraceId('rnc');
  if (!isFeatureEnabled('sot_rir_rnc')) {
    recordSotFallback({ domain: 'rnc', reason: 'feature_flag_disabled', traceId });
    return { updatedAt: new Date().toISOString(), missing: true, traceId };
  }
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'rnc', reason: 'supabase_unavailable', traceId });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'rnc', reason: 'supabase_unavailable', traceId });
  }
  const { data, error } = await supabase.rpc('iso_pro_write_rnc_sot', {
    p_tenant_id: getActiveTenantId(),
    p_baseline: opts.baselineUpdatedAt,
    p_upsert: opts.upsert ?? null,
    p_remove_ids: opts.removeIds?.length ? opts.removeIds : null,
    p_replace_all: opts.replaceAll ?? null,
    p_idempotency_key: opts.idempotencyKey?.trim() || null,
  });
  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({
        domain: 'rnc',
        reason: 'rpc_missing',
        detail: error.message,
        traceId,
      });
    }
    if (String(error.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT')) {
      throw new IsoProSnapshotConflictError(error.message);
    }
    throw new Error(error.message);
  }
  invalidateOperacaoContagensBestEffort();
  return { updatedAt: data != null ? String(data) : new Date().toISOString(), missing: false, traceId };
}

export async function syncRirFromSnapshot(): Promise<{ ok: boolean; rir?: number; error?: string }> {
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_sync_rir_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; rir?: number; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha no sync RIR.' };
  return { ok: true, rir: Number(row.rir) || 0 };
}

export async function syncRncFromSnapshot(): Promise<{ ok: boolean; rnc?: number; error?: string }> {
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_sync_rnc_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; rnc?: number; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha no sync RNC.' };
  return { ok: true, rnc: Number(row.rnc) || 0 };
}

export async function upsertRirEmLotes(
  registros: unknown[],
): Promise<{ ok: boolean; rir: number; error?: string }> {
  if (!hasSupabaseConfig()) return { ok: false, rir: 0, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, rir: 0, error: 'Supabase indisponivel.' };
  if (!registros.length) return { ok: true, rir: 0 };
  const { data, error } = await supabase.rpc('iso_pro_upsert_rir_lote', {
    p_tenant_id: getActiveTenantId(),
    p_registros: registros,
  });
  if (error) return { ok: false, rir: 0, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; rir?: number; error?: string };
  if (row.ok === false) return { ok: false, rir: 0, error: row.error ?? 'Falha no upsert RIR.' };
  return { ok: true, rir: Number(row.rir) || 0 };
}

export async function upsertRncEmLotes(
  registros: unknown[],
): Promise<{ ok: boolean; rnc: number; error?: string }> {
  if (!hasSupabaseConfig()) return { ok: false, rnc: 0, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, rnc: 0, error: 'Supabase indisponivel.' };
  if (!registros.length) return { ok: true, rnc: 0 };
  const { data, error } = await supabase.rpc('iso_pro_upsert_rnc_lote', {
    p_tenant_id: getActiveTenantId(),
    p_registros: registros,
  });
  if (error) return { ok: false, rnc: 0, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; rnc?: number; error?: string };
  if (row.ok === false) return { ok: false, rnc: 0, error: row.error ?? 'Falha no upsert RNC.' };
  return { ok: true, rnc: Number(row.rnc) || 0 };
}

export async function deleteRirFromTables(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!ids.length) return { ok: true };
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { error } = await supabase.rpc('iso_pro_delete_rir', {
    p_tenant_id: getActiveTenantId(),
    p_ids: ids,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listRirPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{ registros: unknown[]; total: number; source: string; error?: string }> {
  if (!hasSupabaseConfig()) {
    return { registros: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { registros: [], total: 0, source: 'none', error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_list_rir_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
  });
  if (error) return { registros: [], total: 0, source: 'error', error: error.message };
  const row = (data ?? {}) as { registros?: unknown; total?: number; _source?: string; _error?: string };
  if (row._error) return { registros: [], total: 0, source: 'error', error: row._error };
  return {
    registros: Array.isArray(row.registros) ? row.registros : [],
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
  };
}

export async function listRncPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{ registros: unknown[]; total: number; source: string; error?: string }> {
  if (!hasSupabaseConfig()) {
    return { registros: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { registros: [], total: 0, source: 'none', error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_list_rnc_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
  });
  if (error) return { registros: [], total: 0, source: 'error', error: error.message };
  const row = (data ?? {}) as { registros?: unknown; total?: number; _source?: string; _error?: string };
  if (row._error) return { registros: [], total: 0, source: 'error', error: row._error };
  return {
    registros: Array.isArray(row.registros) ? row.registros : [],
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
  };
}
