import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export type OperacaoContagens = {
  docsPendentes: number;
  docsStatusPendente: number;
  docsStatusParcial: number;
  docsTotal: number;
  recebimentosAguardando: number;
  conferenciaPendente: number;
  recebimentosDivergentes: number;
  inventariosAbertos: number;
  inventariosComDivergencia: number;
  inventarioDiasMaisAntigo: number;
  rirAbertos: number;
  rncAbertas: number;
  rirReprovadoSemRnc: number;
  sourceDocs: string;
};

const CONTAGENS_VAZIAS: OperacaoContagens = {
  docsPendentes: 0,
  docsStatusPendente: 0,
  docsStatusParcial: 0,
  docsTotal: 0,
  recebimentosAguardando: 0,
  conferenciaPendente: 0,
  recebimentosDivergentes: 0,
  inventariosAbertos: 0,
  inventariosComDivergencia: 0,
  inventarioDiasMaisAntigo: 0,
  rirAbertos: 0,
  rncAbertas: 0,
  rirReprovadoSemRnc: 0,
  sourceDocs: 'none',
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Contagens leves para Painel e badges (1 RPC, sem arrays). */
export async function fetchOperacaoContagens(): Promise<OperacaoContagens> {
  if (!hasSupabaseConfig()) return { ...CONTAGENS_VAZIAS };
  const supabase = getSupabase();
  if (!supabase) return { ...CONTAGENS_VAZIAS };

  const { data, error } = await supabase.rpc('iso_pro_operacao_contagens', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return { ...CONTAGENS_VAZIAS };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row._error) return { ...CONTAGENS_VAZIAS };

  return {
    docsPendentes: num(row.docsPendentes),
    docsStatusPendente: num(row.docsStatusPendente),
    docsStatusParcial: num(row.docsStatusParcial),
    docsTotal: num(row.docsTotal),
    recebimentosAguardando: num(row.recebimentosAguardando),
    conferenciaPendente: num(row.conferenciaPendente),
    recebimentosDivergentes: num(row.recebimentosDivergentes),
    inventariosAbertos: num(row.inventariosAbertos),
    inventariosComDivergencia: num(row.inventariosComDivergencia),
    inventarioDiasMaisAntigo: num(row.inventarioDiasMaisAntigo),
    rirAbertos: num(row.rirAbertos),
    rncAbertas: num(row.rncAbertas),
    rirReprovadoSemRnc: num(row.rirReprovadoSemRnc),
    sourceDocs: String(row._sourceDocs ?? 'unknown'),
  };
}

export type DocumentoPendenteAtendimentoWire = {
  id: string;
  numero?: string;
  revisao?: string;
  descricao?: string;
  responsavel?: string;
  status?: string;
  itens?: Array<{
    id?: string;
    codigo?: string;
    descricao?: string;
    unidade?: string;
    quantidade?: number;
    quantidadeAtendida?: number;
  }>;
};

/** Pendentes de atendimento a partir das tabelas (sem documentos[] do snapshot). */
export async function listDocumentosPendentesAtendimentoFromCloud(options?: {
  busca?: string;
  limit?: number;
}): Promise<{
  documentos: DocumentoPendenteAtendimentoWire[];
  total: number;
  truncated: boolean;
  source: string;
  error?: string;
}> {
  if (!hasSupabaseConfig()) {
    return { documentos: [], total: 0, truncated: false, source: 'none', error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { documentos: [], total: 0, truncated: false, source: 'none', error: 'Supabase indisponivel.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_list_documentos_pendentes_atendimento', {
    p_tenant_id: getActiveTenantId(),
    p_busca: options?.busca?.trim() || null,
    p_limit: options?.limit ?? 2000,
  });
  if (error) {
    return { documentos: [], total: 0, truncated: false, source: 'error', error: error.message };
  }
  const row = (data ?? {}) as {
    documentos?: unknown;
    total?: number;
    truncated?: boolean;
    _source?: string;
    _error?: string;
    _hint?: string;
  };
  if (row._error) {
    return { documentos: [], total: 0, truncated: false, source: 'error', error: row._error };
  }
  const list = Array.isArray(row.documentos) ? (row.documentos as DocumentoPendenteAtendimentoWire[]) : [];
  return {
    documentos: list,
    total: num(row.total),
    truncated: Boolean(row.truncated),
    source: String(row._source ?? 'tables'),
  };
}

/** Mapa codigo → quantidade já atendida (tabelas). */
export async function fetchQuantidadeAtendidaPorCodigo(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!hasSupabaseConfig()) return out;
  const supabase = getSupabase();
  if (!supabase) return out;

  const { data, error } = await supabase.rpc('iso_pro_sum_quantidade_atendida_por_codigo', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return out;
  const row = (data ?? {}) as { porCodigo?: Record<string, unknown>; _error?: string };
  if (row._error || !row.porCodigo || typeof row.porCodigo !== 'object') return out;
  for (const [k, v] of Object.entries(row.porCodigo)) {
    const key = String(k ?? '').trim().toLowerCase();
    if (!key) continue;
    out.set(key, num(v));
  }
  return out;
}
