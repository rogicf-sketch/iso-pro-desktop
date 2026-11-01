import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { resolveSotUnavailable } from './sotWriteGuard';
import { getSupabase, hasSupabaseConfig } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

/**
 * SoT configuracoesSistema — substitui patch_snapshot no sync de Configurações.
 */
export async function writeConfiguracoesSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  configuracoes: Record<string, unknown>;
  disciplinas?: unknown[] | null;
  unidades?: unknown[] | null;
}): Promise<{ updatedAt: string; missing: boolean }> {
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'configuracoes', reason: 'supabase_unavailable' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'configuracoes', reason: 'supabase_unavailable' });
  }
  if (!opts.baselineUpdatedAt) {
    return resolveSotUnavailable({
      domain: 'configuracoes',
      reason: 'unknown',
      detail: 'baseline em falta',
    });
  }

  const { data, error } = await supabase.rpc('iso_pro_write_configuracoes_sot', {
    p_tenant_id: getActiveTenantId(),
    p_baseline: opts.baselineUpdatedAt,
    p_configuracoes: opts.configuracoes,
    p_disciplinas: opts.disciplinas ?? null,
    p_unidades: opts.unidades ?? null,
  });

  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({
        domain: 'configuracoes',
        reason: 'rpc_missing',
        detail: error.message,
      });
    }
    if (String(error.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT')) {
      throw new IsoProSnapshotConflictError(error.message);
    }
    throw new Error(error.message);
  }
  return { updatedAt: data != null ? String(data) : new Date().toISOString(), missing: false };
}
