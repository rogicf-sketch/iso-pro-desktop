import { clearIsoProJwtSession, ensureIsoProDataSessionReadable } from './isoProJwtSession';
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

  // Mesmo padrao do Planejamento: sessao Auth residual esconde linhas via RLS
  // e o Atendimento ficava sem desenhos na busca/bipe enquanto o Planejamento listava.
  await ensureIsoProDataSessionReadable();

  const invoke = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return { data: null as unknown, error: { message: 'Supabase indisponivel.' } };
    }
    return supabase.rpc('iso_pro_list_documentos_pendentes_atendimento', {
      p_tenant_id: getActiveTenantId(),
      p_busca: options?.busca?.trim() || null,
      p_limit: options?.limit ?? 2000,
    });
  };

  let { data, error } = await invoke();

  const totalOf = (raw: unknown) => Number((raw as { total?: number } | null)?.total ?? 0);
  const sourceOf = (raw: unknown) => String((raw as { _source?: string } | null)?._source ?? '');
  const needsAnonRetry =
    (error && /ISO_PRO_TENANT_FORBIDDEN|ISO_PRO_TENANT_INVALID/i.test(String(error.message))) ||
    (!error && (totalOf(data) === 0 || sourceOf(data) === 'snapshot'));

  if (needsAnonRetry) {
    await clearIsoProJwtSession();
    ({ data, error } = await invoke());
  }

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

/**
 * Documentos pendentes que contêm um código de material (leitura directa das tabelas).
 * Usado pelo atendimento via leitor: o boot carrega só os primeiros pendentes e o
 * material bipado pode estar em documentos fora dessa página.
 */
export async function listDocumentosPendentesPorCodigoMaterialFromCloud(
  codigoMaterial: string,
): Promise<{ documentos: DocumentoPendenteAtendimentoWire[]; error?: string }> {
  const codigo = codigoMaterial.trim();
  if (!codigo) return { documentos: [] };
  if (!hasSupabaseConfig()) return { documentos: [], error: 'Supabase nao configurado.' };

  await ensureIsoProDataSessionReadable();

  const queryOnce = async (): Promise<{ documentos: DocumentoPendenteAtendimentoWire[]; error?: string }> => {
    const supabase = getSupabase();
    if (!supabase) return { documentos: [], error: 'Supabase indisponivel.' };
    const tenantId = getActiveTenantId();

    const { data: linhas, error: e1 } = await supabase
      .from('iso_pro_documento_itens_planejamento')
      .select('documento_id,quantidade,quantidade_atendida')
      .eq('tenant_id', tenantId)
      .ilike('codigo', codigo)
      .limit(400);
    if (e1) return { documentos: [], error: e1.message };

    const docIds = [
      ...new Set(
        (linhas ?? [])
          .filter((l) => (Number(l.quantidade) || 0) > (Number(l.quantidade_atendida) || 0) + 1e-9)
          .map((l) => String(l.documento_id)),
      ),
    ].slice(0, 60);
    if (!docIds.length) return { documentos: [] };

    const [{ data: docs, error: e2 }, { data: itens, error: e3 }] = await Promise.all([
      supabase
        .from('iso_pro_documentos_planejamento')
        .select('id,numero,revisao,descricao,responsavel,status')
        .eq('tenant_id', tenantId)
        .in('id', docIds),
      supabase
        .from('iso_pro_documento_itens_planejamento')
        .select('id,documento_id,codigo,descricao,unidade,quantidade,quantidade_atendida')
        .eq('tenant_id', tenantId)
        .in('documento_id', docIds),
    ]);
    if (e2) return { documentos: [], error: e2.message };
    if (e3) return { documentos: [], error: e3.message };

    const itensPorDoc = new Map<string, DocumentoPendenteAtendimentoWire['itens']>();
    for (const item of itens ?? []) {
      if ((Number(item.quantidade) || 0) <= (Number(item.quantidade_atendida) || 0) + 1e-9) continue;
      const key = String(item.documento_id);
      const lista = itensPorDoc.get(key) ?? [];
      lista.push({
        id: String(item.id),
        codigo: String(item.codigo ?? ''),
        descricao: String(item.descricao ?? ''),
        unidade: String(item.unidade ?? 'UN'),
        quantidade: Number(item.quantidade) || 0,
        quantidadeAtendida: Number(item.quantidade_atendida) || 0,
      });
      itensPorDoc.set(key, lista);
    }

    const documentos: DocumentoPendenteAtendimentoWire[] = (docs ?? [])
      .filter((d) => String(d.status ?? '').trim().toLowerCase() !== 'cancelado')
      .map((d) => ({
        id: String(d.id),
        numero: String(d.numero ?? ''),
        revisao: String(d.revisao ?? 'A'),
        descricao: String(d.descricao ?? ''),
        responsavel: String(d.responsavel ?? ''),
        status: String(d.status ?? 'pendente'),
        itens: itensPorDoc.get(String(d.id)) ?? [],
      }))
      .filter((d) => (d.itens ?? []).length > 0);

    return { documentos };
  };

  let result = await queryOnce();
  // RLS com JWT residual devolve 0 linhas sem erro — so faz retry se ainda ha sessao Auth.
  if (result.documentos.length === 0) {
    const supabase = getSupabase();
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : '';
    const authBlocked =
      Boolean(result.error) &&
      /ISO_PRO_TENANT_FORBIDDEN|ISO_PRO_TENANT_INVALID|permission|rls|policy|jwt/i.test(result.error ?? '');
    if (token || authBlocked) {
      await clearIsoProJwtSession();
      result = await queryOnce();
    }
  }
  return result;
}

/**
 * Mapa codigo → quantidade recebida, agregado no servidor a partir do snapshot
 * (mesmas regras do buildSaldoMap). Devolve `null` quando a RPC nao existe/falha —
 * o caller decide o fallback (baixar a fatia `recebimentos` completa).
 */
export async function fetchQuantidadeRecebidaPorCodigo(): Promise<Map<string, number> | null> {
  if (!hasSupabaseConfig()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('iso_pro_sum_quantidade_recebida_por_codigo', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) return null;
  const row = (data ?? {}) as { porCodigo?: Record<string, unknown>; _error?: string };
  if (row._error || !row.porCodigo || typeof row.porCodigo !== 'object') return null;
  const out = new Map<string, number>();
  for (const [k, v] of Object.entries(row.porCodigo)) {
    const key = String(k ?? '').trim().toLowerCase();
    if (!key) continue;
    out.set(key, num(v));
  }
  return out;
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
