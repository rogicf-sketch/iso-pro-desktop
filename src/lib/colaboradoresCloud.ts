/**
 * Colaboradores na tabela iso_pro_colaboradores (SoT).
 */
import { ensureIsoProDataSessionReadable } from './isoProJwtSession';
import { IsoProSnapshotConflictError } from './isoProSnapshot';
import { getActiveTenantId } from './isoProTenant';
import { resolveSotUnavailable } from './sotWriteGuard';
import { getSupabase, hasSupabaseConfig } from './supabase';

export type ColaboradorCloudWire = {
  id: string;
  nome?: string;
  tipo?: 'interno' | 'externo';
  matricula?: string;
  funcao?: string;
  empresa?: string;
  documento?: string;
  telefone?: string;
  observacao?: string;
  ativo?: boolean;
};

function isRpcMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

export async function listColaboradoresPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  tipo?: string;
  ativo?: string;
}): Promise<{
  colaboradores: ColaboradorCloudWire[];
  total: number;
  missing: boolean;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { colaboradores: [], total: 0, missing: true, error: 'Supabase nao configurado.' };
  }
  await ensureIsoProDataSessionReadable();

  const invoke = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return { data: null as unknown, error: { message: 'Supabase nao configurado.', code: undefined as string | undefined } };
    }
    return supabase.rpc('iso_pro_list_colaboradores_page', {
      p_tenant_id: getActiveTenantId(),
      p_busca: options?.busca ?? null,
      p_offset: options?.offset ?? 0,
      p_limit: options?.limit ?? 200,
      p_tipo: options?.tipo ?? null,
      p_ativo: options?.ativo ?? null,
    });
  };

  const { data, error } = await invoke();

  if (error) {
    if (isRpcMissingError(error)) {
      return { colaboradores: [], total: 0, missing: true, error: error.message };
    }
    return { colaboradores: [], total: 0, missing: false, error: error.message };
  }

  const row = (data ?? {}) as { itens?: ColaboradorCloudWire[]; total?: number };
  return {
    colaboradores: Array.isArray(row.itens) ? row.itens : [],
    total: Number(row.total) || 0,
    missing: false,
  };
}

/** Carrega todos os colaboradores (paginado). */
export async function listAllColaboradoresFromCloud(options?: {
  ativo?: string;
}): Promise<{
  colaboradores: ColaboradorCloudWire[];
  missing: boolean;
  error?: string;
}> {
  const all: ColaboradorCloudWire[] = [];
  const pageSize = 200;
  for (let page = 0; page < 50; page++) {
    const res = await listColaboradoresPageFromCloud({
      offset: page * pageSize,
      limit: pageSize,
      ativo: options?.ativo,
    });
    if (res.missing) return { colaboradores: [], missing: true, error: res.error };
    if (res.error) return { colaboradores: all, missing: false, error: res.error };
    all.push(...res.colaboradores);
    if (all.length >= res.total || res.colaboradores.length < pageSize) break;
  }
  return { colaboradores: all, missing: false };
}

export async function replaceColaboradoresOnCloud(
  items: ColaboradorCloudWire[],
  baselineUpdatedAt: string | null,
): Promise<{ updatedAt: string; missing: boolean }> {
  if (!hasSupabaseConfig()) {
    return resolveSotUnavailable({ domain: 'colaboradores', reason: 'supabase_unavailable' });
  }
  await ensureIsoProDataSessionReadable();
  const supabase = getSupabase();
  if (!supabase) {
    return resolveSotUnavailable({ domain: 'colaboradores', reason: 'supabase_unavailable' });
  }

  const { data, error } = await supabase.rpc('iso_pro_replace_colaboradores', {
    p_tenant_id: getActiveTenantId(),
    p_items: items,
    p_baseline: baselineUpdatedAt,
  });

  if (error) {
    if (isRpcMissingError(error)) {
      return resolveSotUnavailable({
        domain: 'colaboradores',
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

export async function syncColaboradoresFromSnapshotCloud(): Promise<{
  ok: boolean;
  count: number;
  missing: boolean;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { ok: false, count: 0, missing: true };
  }
  const supabase = getSupabase();
  if (!supabase) return { ok: false, count: 0, missing: true };

  const { data, error } = await supabase.rpc('iso_pro_sync_colaboradores_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) return { ok: false, count: 0, missing: true, error: error.message };
    return { ok: false, count: 0, missing: false, error: error.message };
  }
  const row = (data ?? {}) as { ok?: boolean; colaboradores?: number };
  return { ok: row.ok !== false, count: Number(row.colaboradores) || 0, missing: false };
}
