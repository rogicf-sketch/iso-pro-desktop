import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export async function syncInventariosFromSnapshot(): Promise<{
  ok: boolean;
  inventarios?: number;
  itens?: number;
  error?: string;
}> {
  if (!hasSupabaseConfig()) return { ok: false, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_sync_inventarios_from_snapshot', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; inventarios?: number; itens?: number; error?: string };
  if (row.ok === false) return { ok: false, error: row.error ?? 'Falha no sync.' };
  return { ok: true, inventarios: Number(row.inventarios) || 0, itens: Number(row.itens) || 0 };
}

export async function upsertInventariosEmLotes(
  inventarios: unknown[],
): Promise<{ ok: boolean; inventarios: number; itens: number; error?: string }> {
  if (!hasSupabaseConfig()) return { ok: false, inventarios: 0, itens: 0, error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, inventarios: 0, itens: 0, error: 'Supabase indisponivel.' };
  if (!inventarios.length) return { ok: true, inventarios: 0, itens: 0 };
  const { data, error } = await supabase.rpc('iso_pro_upsert_inventarios_lote', {
    p_tenant_id: getActiveTenantId(),
    p_inventarios: inventarios,
  });
  if (error) return { ok: false, inventarios: 0, itens: 0, error: error.message };
  const row = (data ?? {}) as { ok?: boolean; inventarios?: number; itens?: number; error?: string };
  if (row.ok === false) return { ok: false, inventarios: 0, itens: 0, error: row.error ?? 'Falha no upsert.' };
  return { ok: true, inventarios: Number(row.inventarios) || 0, itens: Number(row.itens) || 0 };
}

export async function listInventariosPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<{
  inventarios: Array<Record<string, unknown>>;
  total: number;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { inventarios: [], total: 0, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { inventarios: [], total: 0, source: 'none', error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_list_inventarios_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_status: options?.status && options.status !== 'todos' ? options.status : null,
  });
  if (error) return { inventarios: [], total: 0, source: 'error', error: error.message };
  const row = (data ?? {}) as { inventarios?: unknown; total?: number; _source?: string; _error?: string };
  if (row._error) return { inventarios: [], total: 0, source: 'error', error: row._error };
  return {
    inventarios: Array.isArray(row.inventarios) ? (row.inventarios as Array<Record<string, unknown>>) : [],
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
  };
}

export async function readInventarioFromCloud(id: string): Promise<{
  inventario: Record<string, unknown> | null;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) return { inventario: null, source: 'none', error: 'Supabase nao configurado.' };
  const supabase = getSupabase();
  if (!supabase) return { inventario: null, source: 'none', error: 'Supabase indisponivel.' };
  const { data, error } = await supabase.rpc('iso_pro_read_inventario', {
    p_tenant_id: getActiveTenantId(),
    p_id: id,
  });
  if (error) return { inventario: null, source: 'error', error: error.message };
  const row = (data ?? {}) as { inventario?: Record<string, unknown> | null; _source?: string; _error?: string };
  if (row._error) return { inventario: null, source: 'error', error: row._error };
  return { inventario: row.inventario ?? null, source: String(row._source ?? 'tables') };
}
