/**
 * Estorno V2 — cliente do RPC transacional `iso_pro_estornar_atendimento_v2`.
 * Chave idempotente estável + medição RTT com performance.now().
 */
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { captureOperationalEvent } from '../../../lib/errorReporting';
import { resolveFeatureEnabled } from '../../../lib/featureFlags';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import type { Atendimento, AtendimentoItem, EstornoAtendimentoLinha } from '../types/atendimento.types';

const FLAG_STORAGE = 'iso-pro-desktop-estorno-v2-opt-in-v1';

function estornoV2OptOutLocal(): boolean {
  try {
    const stored = localStorage.getItem(FLAG_STORAGE);
    return stored === '0' || stored === 'false' || stored === 'no';
  } catch {
    return false;
  }
}

export function isEstornoV2FeatureEnabled(): boolean {
  // Precedência: kill-switch remoto (snapshot) > env VITE_ISO_PRO_ESTORNO_V2 > opt-out local > default ON.
  // Omissao: activo (com fallback automatico se RPC faltar).
  return resolveFeatureEnabled('estornoV2', {
    envValue: import.meta.env.VITE_ISO_PRO_ESTORNO_V2,
    localOptOut: estornoV2OptOutLocal(),
    defaultEnabled: true,
  });
}

/** Chave estavel para retries/timeout — nao usa UUIDs aleatorios. */
export function buildEstornoV2IdempotencyKey(input: {
  loteId: string;
  loteNumero: string;
  linhas: Array<{ atendimentoItemId: string; quantidade: number }>;
  motivo: string;
}): string {
  const linhasCanon = [...input.linhas]
    .map((l) => `${String(l.atendimentoItemId).trim()}:${Number(l.quantidade) || 0}`)
    .sort()
    .join('|');
  const motivo = String(input.motivo ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const raw = `${String(input.loteId).trim()}::${String(input.loteNumero).trim()}::${linhasCanon}::${motivo}`;
  // Hash curto deterministico (FNV-1a 32-bit) para caber na chave.
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return `pc-est-v2-${String(input.loteNumero).trim() || 'lote'}-${hex}`;
}

export type EstornoV2RpcResult = {
  ok: boolean;
  error?: string;
  code?: string;
  idempotent_hit?: boolean;
  duration_ms?: number;
  estornoParcial?: boolean;
  nomeQuemEstorna?: string;
  nomeQuemDevolve?: string;
  motivoEstorno?: string;
  lote?: {
    id: string;
    numero: string;
    status: 'concluido' | 'estornado';
    version?: number;
    itens?: Array<Record<string, unknown>>;
    documentoId?: string;
    documentoNumero?: string;
    atendente?: string;
    recebedor?: string;
    dataAtendimento?: string;
  };
  itensEstorno?: Array<Record<string, unknown>>;
  documentosAfetados?: Array<Record<string, unknown>>;
};

export type EstornoV2Meta = {
  nomeQuemEstorna?: string;
  nomeQuemDevolve?: string;
  motivoEstorno?: string;
  atendimentoSnapshot?: Atendimento;
  expectedVersion?: number;
  /** Reutilizar chave de tentativa anterior (timeout/retry). */
  idempotencyKey?: string;
};

function mapLoteToAtendimento(lote: NonNullable<EstornoV2RpcResult['lote']>, fallback?: Atendimento): Atendimento {
  const itens: AtendimentoItem[] = (lote.itens ?? []).map((raw, index) => {
    const it = raw as Record<string, unknown>;
    return {
      id: String(it.id ?? `item-${index + 1}`),
      documentoItemId: String(it.documentoItemId ?? ''),
      materialId: null,
      codigoMaterial: String(it.codigoMaterial ?? it.codigo ?? ''),
      descricaoMaterial: String(it.descricaoMaterial ?? it.descricao ?? ''),
      unidade: String(it.unidade ?? 'UN'),
      quantidadeAtendida: Number(it.quantidadeAtendida ?? 0) || 0,
      quantidadeRetiradaOriginal: Number(it.quantidadeRetiradaOriginal ?? it.quantidadeAtendida ?? 0) || 0,
      documentoNumero: String(it.documentoNumero ?? lote.documentoNumero ?? ''),
    };
  });

  return {
    id: String(lote.id),
    numero: String(lote.numero),
    documentoId: String(lote.documentoId ?? fallback?.documentoId ?? ''),
    documentoNumero: String(lote.documentoNumero ?? fallback?.documentoNumero ?? ''),
    atendente: String(lote.atendente ?? fallback?.atendente ?? ''),
    recebedorTipo: fallback?.recebedorTipo ?? 'interno',
    recebedorColaboradorId: fallback?.recebedorColaboradorId ?? null,
    recebedor: String(lote.recebedor ?? fallback?.recebedor ?? ''),
    recebedorEmpresa: fallback?.recebedorEmpresa ?? '',
    recebedorDocumento: fallback?.recebedorDocumento ?? '',
    recebedorTelefone: fallback?.recebedorTelefone ?? '',
    autorizadorInterno: fallback?.autorizadorInterno ?? '',
    motivoRetirada: fallback?.motivoRetirada ?? '',
    origem: fallback?.origem ?? 'windows',
    status: lote.status === 'estornado' ? 'estornado' : 'concluido',
    dataAtendimento: String(lote.dataAtendimento ?? fallback?.dataAtendimento ?? new Date().toISOString()),
    itens,
  };
}

export async function estornarAtendimentoV2(
  id: string,
  linhasEstorno: EstornoAtendimentoLinha[] | undefined,
  meta?: EstornoV2Meta,
): Promise<ServiceResult<Atendimento> & { meta?: ServiceResult<Atendimento>['meta'] & {
  estornoV2?: true;
  idempotencyKey?: string;
  durationMs?: number;
  serverDurationMs?: number;
  idempotentHit?: boolean;
  rpcMissing?: boolean;
  documentosAfetados?: EstornoV2RpcResult['documentosAfetados'];
} }> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.', meta: { rpcMissing: true } };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Supabase indisponivel.', meta: { rpcMissing: true } };
  }

  const fromUi = meta?.atendimentoSnapshot;
  const loteNumero = String(fromUi?.numero ?? '').trim();
  const linhasEfetivas =
    linhasEstorno && linhasEstorno.length > 0
      ? linhasEstorno
      : (fromUi?.itens ?? []).map((i) => ({
          atendimentoItemId: i.id,
          quantidade: i.quantidadeAtendida,
        }));

  if (!linhasEfetivas.length) {
    return { success: false, error: 'Nenhuma linha para estornar.' };
  }

  const idempotencyKey =
    meta?.idempotencyKey?.trim() ||
    buildEstornoV2IdempotencyKey({
      loteId: id,
      loteNumero: loteNumero || id,
      linhas: linhasEfetivas.map((l) => ({
        atendimentoItemId: String(l.atendimentoItemId ?? '').trim(),
        quantidade: Number(l.quantidade) || 0,
      })),
      motivo: String(meta?.motivoEstorno ?? ''),
    });

  const pLinhas = linhasEfetivas.map((l) => ({
    atendimentoItemId: String(l.atendimentoItemId ?? '').trim(),
    documentoItemId: fromUi?.itens.find((i) => i.id === l.atendimentoItemId)?.documentoItemId ?? '',
    quantidade: Number(l.quantidade) || 0,
  }));

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { data, error } = await supabase.rpc('iso_pro_estornar_atendimento_v2', {
    p_tenant_id: getActiveTenantId(),
    p_idempotency_key: idempotencyKey,
    p_lote_id: id,
    p_lote_numero: loteNumero || null,
    p_linhas: pLinhas,
    p_nome_quem_estorna: String(meta?.nomeQuemEstorna ?? '').trim() || null,
    p_nome_quem_devolve: String(meta?.nomeQuemDevolve ?? '').trim() || null,
    p_motivo: String(meta?.motivoEstorno ?? '').trim() || null,
    p_expected_version: meta?.expectedVersion ?? null,
  });
  const durationMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
  );

  if (error) {
    const msg = String(error.message ?? '');
    const rpcMissing = /could not find|function .* does not exist|PGRST202/i.test(msg);
    captureOperationalEvent(
      rpcMissing ? 'estorno_v2_rpc_missing' : 'estorno_v2_error',
      { durationMs, msg: msg.slice(0, 200) },
      'warning',
    );
    return {
      success: false,
      error: rpcMissing
        ? 'RPC de estorno V2 indisponivel (aplique a migration no Supabase).'
        : msg || 'Falha ao estornar na nuvem.',
      meta: { source: 'remote', estornoV2: true, idempotencyKey, durationMs, rpcMissing },
    };
  }

  const row = (data ?? {}) as EstornoV2RpcResult;
  if (!row.ok) {
    captureOperationalEvent(
      row.code === 'VERSION_CONFLICT' ? 'estorno_conflict' : 'estorno_v2_rejected',
      { code: row.code, durationMs },
      'info',
    );
    return {
      success: false,
      error: row.error ?? 'Nao foi possivel estornar o atendimento.',
      meta: {
        source: 'remote',
        estornoV2: true,
        idempotencyKey,
        durationMs,
        serverDurationMs: Number(row.duration_ms) || undefined,
        snapshotConflict: row.code === 'VERSION_CONFLICT',
      },
    };
  }

  if (!row.lote) {
    return {
      success: false,
      error: 'Resposta de estorno incompleta.',
      meta: { source: 'remote', estornoV2: true, idempotencyKey, durationMs },
    };
  }

  const atendimento = mapLoteToAtendimento(row.lote, fromUi);
  captureOperationalEvent(
    row.idempotent_hit ? 'estorno_idempotent_hit' : 'estorno_ok',
    {
      durationMs,
      serverMs: row.duration_ms,
      parcial: Boolean(row.estornoParcial),
    },
    'info',
  );

  return {
    success: true,
    data: atendimento,
    meta: {
      source: 'remote',
      estornoV2: true,
      idempotencyKey,
      durationMs,
      serverDurationMs: Number(row.duration_ms) || undefined,
      idempotentHit: Boolean(row.idempotent_hit),
      documentosAfetados: row.documentosAfetados,
    },
  };
}
