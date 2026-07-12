import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

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
