import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { resolveSotUnavailable } from './sotWriteGuard';
import type { SotFallbackDomain } from './sotFallbackTelemetry';
import { getSupabase, hasSupabaseConfig } from './supabase';

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

async function writeCadastroSotOnCloud(
  rpcName: string,
  domain: SotFallbackDomain,
  opts: { baselineUpdatedAt: string | null; replaceAll: unknown[] },
): Promise<{ updatedAt: string; missing: boolean }> {
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain, reason: 'supabase_unavailable' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain, reason: 'supabase_unavailable' });
  }

  const { data, error } = await supabase.rpc(rpcName, {
    p_tenant_id: getActiveTenantId(),
    p_baseline: opts.baselineUpdatedAt,
    p_replace_all: opts.replaceAll,
  });

  if (error) {
    if (isRpcMissingError(error.message)) {
      return resolveSotUnavailable({ domain, reason: 'rpc_missing', detail: error.message });
    }
    if (String(error.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT')) {
      throw new IsoProSnapshotConflictError(error.message);
    }
    throw new Error(error.message);
  }
  return { updatedAt: data != null ? String(data) : new Date().toISOString(), missing: false };
}

/**
 * SoT table-first fornecedores: tabelas + projecao snapshot (sem outbox).
 * Com `sot_require_rpc`: RPC ausente → hard-fail.
 */
export async function writeFornecedoresSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  replaceAll: unknown[];
}): Promise<{ updatedAt: string; missing: boolean }> {
  return writeCadastroSotOnCloud('iso_pro_write_fornecedores_sot', 'fornecedores', opts);
}

/** SoT table-first equipamentos. */
export async function writeEquipamentosSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  replaceAll: unknown[];
}): Promise<{ updatedAt: string; missing: boolean }> {
  return writeCadastroSotOnCloud('iso_pro_write_equipamentos_sot', 'equipamentos', opts);
}

/** SoT table-first etiquetas. */
export async function writeEtiquetasSotOnCloud(opts: {
  baselineUpdatedAt: string | null;
  replaceAll: unknown[];
}): Promise<{ updatedAt: string; missing: boolean }> {
  return writeCadastroSotOnCloud('iso_pro_write_etiquetas_sot', 'etiquetas', opts);
}
