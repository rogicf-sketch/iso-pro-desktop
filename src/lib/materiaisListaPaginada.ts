import { getActiveTenantId } from './isoProTenant';
import { hasSupabaseConfig, rpcSemFilaAuth, shouldUseCloudMaterials } from './supabase';

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

  // Leitura directa: a fila de sessao do cliente segurava a lista e o PC mostrava a copia local antiga.
  const { data, error } = await rpcSemFilaAuth<{
    materiais?: unknown;
    total?: number;
    _source?: string;
    _error?: string;
  }>('iso_pro_list_materiais_page', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_offset: options?.offset ?? 0,
    p_limit: options?.limit ?? 50,
    p_disciplina: options?.disciplina?.trim() || null,
    p_ativo: options?.ativo && options.ativo !== 'todos' ? options.ativo : null,
  });

  if (error) return { materiais: [], total: 0, source: 'error', error };
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
