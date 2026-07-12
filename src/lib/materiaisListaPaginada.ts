import {
  clearIsoProJwtSession,
  ensureIsoProDataSessionReadable,
} from './isoProJwtSession';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig, shouldUseCloudMaterials } from './supabase';

export type MaterialPageWire = {
  id: string | number;
  codigo?: string;
  codigoBarras?: string;
  descricao?: string;
  diametro?: string;
  disciplina?: string;
  unidade?: string;
  peso?: number;
  estoqueMinimo?: number;
  ativo?: boolean;
  saldoAtual?: number;
  observacao?: string;
};

export async function listMateriaisPageFromCloud(options?: {
  busca?: string;
  offset?: number;
  limit?: number;
  disciplina?: string;
  ativo?: string;
}): Promise<{
  materiais: MaterialPageWire[];
  total: number;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig() || !shouldUseCloudMaterials()) {
    return { materiais: [], total: 0, source: 'none', error: 'Materiais nuvem indisponiveis.' };
  }

  await ensureIsoProDataSessionReadable();

  const invoke = async () => {
    const supabase = getSupabase();
    if (!supabase) return { data: null as unknown, error: { message: 'Supabase indisponivel.' } };
    return supabase.rpc('iso_pro_list_materiais_page', {
      p_tenant_id: getActiveTenantId(),
      p_busca: options?.busca?.trim() || null,
      p_offset: options?.offset ?? 0,
      p_limit: options?.limit ?? 50,
      p_disciplina: options?.disciplina?.trim() || null,
      p_ativo: options?.ativo && options.ativo !== 'todos' ? options.ativo : null,
    });
  };

  let { data, error } = await invoke();

  if (
    (error && /ISO_PRO_TENANT_FORBIDDEN|ISO_PRO_TENANT_INVALID/i.test(String(error.message))) ||
    (!error && Number((data as { total?: number } | null)?.total ?? 0) === 0)
  ) {
    await clearIsoProJwtSession();
    ({ data, error } = await invoke());
  }

  if (error) return { materiais: [], total: 0, source: 'error', error: error.message };
  const row = (data ?? {}) as {
    materiais?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  };
  if (row._error) return { materiais: [], total: 0, source: 'error', error: row._error };
  const list = Array.isArray(row.materiais) ? (row.materiais as MaterialPageWire[]) : [];
  return {
    materiais: list,
    total: Number(row.total) || 0,
    source: String(row._source ?? 'tables'),
  };
}
