import { parseIsoSnapshotPayloadFromUnknown, type IsoSnapshotPayload } from 'iso-pro-shared';
import { flushEscalaOutboxBestEffort } from './escalaOutbox';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';
import { invalidateSnapshotDerivedCaches } from './snapshotDerivedCache';
import { notifySnapshotConflict, requestSnapshotRefresh } from './snapshotSessionSync';
import { applyRemoteFeatureFlags } from './featureFlags';

/** Chaves usadas pelo modulo Atendimento + calculo de saldo. */
export const SNAPSHOT_OPERATIONAL_SLICE_KEYS = [
  'documentos',
  'recebimentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
  'materiais',
  'estoqueAjustes',
] as const;

/**
 * Fatia operacional sem `documentos[]` — usar quando o planejamento vem das tabelas
 * (lista de pendentes / saldo com soma por codigo).
 */
export const SNAPSHOT_ATENDIMENTO_LIGHT_SLICE_KEYS = [
  'recebimentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
  'materiais',
  'estoqueAjustes',
] as const;

/**
 * Fatia leve sem `recebimentos` — usar quando o saldo recebido por codigo
 * vem agregado do servidor (`iso_pro_sum_quantidade_recebida_por_codigo`).
 */
export const SNAPSHOT_ATENDIMENTO_LIGHT_SEM_RECEBIMENTOS_SLICE_KEYS = [
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
  'materiais',
  'estoqueAjustes',
] as const;

/**
 * Fatia minima para gravar baixa/sessao: sem historico nem lista de lotes
 * (obra grande = dezenas de MB e 40–60s). Sequencia vem de configuracoesSistema
 * + lotes locais; saldo de materiais + agregados do servidor.
 */
export const SNAPSHOT_ATENDIMENTO_BAIXA_WRITE_SLICE_KEYS = [
  'materiais',
  'estoqueAjustes',
  'configuracoesSistema',
] as const;

/** Minimo para saldo com agregados do servidor (recebido/atendido por codigo). */
export const SNAPSHOT_SALDO_AGREGADOS_SLICE_KEYS = ['materiais', 'estoqueAjustes'] as const;

/** Só histórico de lotes (abrir Atendimento sem baixar documentos[]). */
export const SNAPSHOT_ATENDIMENTO_HISTORICO_SLICE_KEYS = [
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
] as const;

/** Subconjunto minimo para `buildSaldoMap`. Inclui o log de estornos: a reconciliacao abate estornos do historico. */
export const SNAPSHOT_SALDO_SLICE_KEYS = [
  'recebimentos',
  'documentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
  'estoqueAjustes',
  'materiais',
] as const;

/** Planejamento (documentos) + refs de atendimento para reconciliacao (estornos abatem o historico). */
export const SNAPSHOT_PLANEJAMENTO_SLICE_KEYS = [
  'documentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoEstornoLog',
] as const;

export type SnapshotSliceKey =
  | (typeof SNAPSHOT_OPERATIONAL_SLICE_KEYS)[number]
  | (typeof SNAPSHOT_ATENDIMENTO_LIGHT_SLICE_KEYS)[number]
  | (typeof SNAPSHOT_ATENDIMENTO_HISTORICO_SLICE_KEYS)[number]
  | (typeof SNAPSHOT_SALDO_SLICE_KEYS)[number]
  | string;

/** Intersecção para o genérico do snapshot (JSON em `iso_pro_snapshot.payload`). */
type IsoSnapshotPayloadRecord = IsoSnapshotPayload & Record<string, unknown>;

/** Leitura em cache, gravacao com baseline `updated_at` e retry em conflito de versao (`iso_pro_snapshot`). */
const SNAPSHOT_ID = 'default';
const SNAPSHOT_CACHE_TTL_MS = 1500;
const SNAPSHOT_SLICE_CACHE_TTL_MS = 5000;

let cachedPayload: Record<string, unknown> | null = null;
let cachedAt = 0;
let inflightRead: Promise<Record<string, unknown>> | null = null;

let cachedSliceKey: string | null = null;
let cachedSlicePayload: Record<string, unknown> | null = null;
let cachedSliceAt = 0;

export function invalidateIsoProSnapshotCache() {
  cachedPayload = null;
  cachedAt = 0;
  inflightRead = null;
  cachedSliceKey = null;
  cachedSlicePayload = null;
  cachedSliceAt = 0;
  invalidateSnapshotDerivedCaches();
}

function sliceCacheKey(keys: readonly string[]): string {
  return [...keys].sort().join('\0');
}

function isRpcMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  return code === 'PGRST202' || msg.includes('could not find the function') || msg.includes('function') && msg.includes('does not exist');
}

function isSnapshotConflictRpcError(error: { message?: string } | null): boolean {
  return String(error?.message ?? '').includes('ISO_PRO_SNAPSHOT_CONFLICT');
}

function extractSlicesFromRpcRow(raw: Record<string, unknown>): {
  slices: Record<string, unknown>;
  updatedAt: string | null;
} {
  const updatedAt = raw._updatedAt != null ? String(raw._updatedAt) : null;
  const slices: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_')) continue;
    slices[key] = value;
  }
  return { slices, updatedAt };
}

async function readSnapshotSlicesFromRpc(
  keys: readonly string[],
): Promise<{ slices: Record<string, unknown>; updatedAt: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: getActiveTenantId(),
    p_keys: [...keys],
  });
  if (error) {
    if (isRpcMissingError(error)) return null;
    throw new Error(error.message);
  }
  if (!data || typeof data !== 'object') {
    return { slices: {}, updatedAt: null };
  }
  return extractSlicesFromRpcRow(data as Record<string, unknown>);
}

async function readSnapshotSlicesFromSelect(
  keys: readonly string[],
): Promise<{ slices: Record<string, unknown>; updatedAt: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }
  // documentos vive na coluna dedicada (pos-migration 19030000); restantes no payload.
  const wantsDocumentos = keys.includes('documentos');
  const payloadKeys = keys.filter((k) => k !== 'documentos');
  const selectParts = [
    ...payloadKeys.map((k) => `payload->${k}`),
    ...(wantsDocumentos ? ['documentos'] : []),
    'updated_at',
  ];
  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select(selectParts.join(', '))
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const slices: Record<string, unknown> = {};
  const row = (data ?? {}) as Record<string, unknown>;
  for (const key of payloadKeys) {
    if (key in row) {
      slices[key] = row[key];
    }
  }
  if (wantsDocumentos && 'documentos' in row) {
    slices.documentos = row.documentos;
  }
  const updatedAt = row.updated_at != null ? String(row.updated_at) : null;
  return { slices, updatedAt };
}

/**
 * Leitura parcial do snapshot (RPC ou select jsonb). Cache dedicado 5s para polling de atendimento.
 */
export async function readIsoProSnapshotSlices<T extends Record<string, unknown> = Record<string, unknown>>(
  keys: readonly SnapshotSliceKey[],
  options?: { bypassCache?: boolean },
): Promise<T> {
  const cacheKey = sliceCacheKey(keys);
  const now = Date.now();
  if (
    !options?.bypassCache &&
    cachedSliceKey === cacheKey &&
    cachedSlicePayload &&
    now - cachedSliceAt <= SNAPSHOT_SLICE_CACHE_TTL_MS
  ) {
    return snapshotCopy<T>(cachedSlicePayload);
  }

  const fromRpc = await readSnapshotSlicesFromRpc(keys);
  const { slices } = fromRpc ?? (await readSnapshotSlicesFromSelect(keys));

  mergeSlicesIntoFullCache(slices);
  cachedSliceKey = cacheKey;
  cachedSlicePayload = slices;
  cachedSliceAt = now;
  return snapshotCopy<T>(slices as Record<string, unknown>);
}

function mergeSlicesIntoFullCache(slices: Record<string, unknown>): void {
  if (!cachedPayload) {
    cachedPayload = { ...slices };
    cachedAt = Date.now();
    return;
  }
  Object.assign(cachedPayload, slices);
  cachedAt = Date.now();
}

export type IsoProSnapshotSliceWriteBaseline = {
  slices: Record<string, unknown>;
  baselineUpdatedAt: string | null;
};

/** Leitura fresca de fatias + baseline (para patch parcial). */
export async function readIsoProSnapshotSlicesForWrite(
  keys: readonly SnapshotSliceKey[],
): Promise<IsoProSnapshotSliceWriteBaseline> {
  const fromRpc = await readSnapshotSlicesFromRpc(keys);
  const { slices, updatedAt } = fromRpc ?? (await readSnapshotSlicesFromSelect(keys));
  mergeSlicesIntoFullCache(slices);
  return { slices: snapshotCopy(slices), baselineUpdatedAt: updatedAt };
}

export type IsoProSnapshotStats = {
  payloadBytes: number;
  updatedAt: string | null;
};

/** Tamanho do payload na nuvem sem transferir o JSON (RPC). */
export async function readIsoProSnapshotStats(): Promise<IsoProSnapshotStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('iso_pro_snapshot_stats', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) return null;
    throw new Error(error.message);
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return null;
  return {
    payloadBytes: Number(row.payloadBytes ?? 0),
    updatedAt: row.updatedAt != null ? String(row.updatedAt) : null,
  };
}

function snapshotCopy<T extends Record<string, unknown>>(payload: Record<string, unknown>): T {
  return structuredClone(payload) as T;
}

/** Leitura da BD: valida o contrato e descarta dados corrompidos (defesa em profundidade). */
function snapshotPayloadFromDatabase(raw: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseIsoSnapshotPayloadFromUnknown(raw);
  if (!parsed.ok) {
    console.warn('[I.S.O PRO] Payload do snapshot rejeitado na leitura:', parsed.error);
    return {};
  }
  return parsed.data as Record<string, unknown>;
}

/** Gravação: garante que só entra JSON conforme o contrato partilhado com o app campo. */
function assertPayloadSafeForWrite(payload: Record<string, unknown>): IsoSnapshotPayloadRecord {
  const parsed = parseIsoSnapshotPayloadFromUnknown(payload);
  if (!parsed.ok) {
    throw new Error(`Snapshot invalido para gravacao: ${parsed.error}`);
  }
  return parsed.data as IsoSnapshotPayloadRecord;
}

export type IsoProSnapshotWriteBaseline<T extends Record<string, unknown>> = {
  payload: T;
  /** Valor exato de `updated_at` na linha lida; null se ainda nao existir snapshot no banco. */
  baselineUpdatedAt: string | null;
};

export async function readIsoProSnapshotPayloadForWrite<T extends Record<string, unknown>>(): Promise<IsoProSnapshotWriteBaseline<T>> {
  if (inflightRead) {
    try {
      await inflightRead;
    } catch {
      // leitura compartilhada falhou; seguimos com select dedicado a gravacao
    }
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select('payload, updated_at')
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  const raw = ((data?.payload ?? {}) as Record<string, unknown>) ?? {};
  const payload = snapshotPayloadFromDatabase(raw);
  cachedPayload = payload;
  cachedAt = Date.now();
  applyRemoteFeatureFlags(raw);

  const baselineUpdatedAt = data?.updated_at != null ? String(data.updated_at) : null;
  return { payload: snapshotCopy<T>(payload), baselineUpdatedAt };
}

export async function readIsoProSnapshotPayload<T extends Record<string, unknown> = IsoSnapshotPayloadRecord>() {
  const now = Date.now();
  if (cachedPayload && now - cachedAt <= SNAPSHOT_CACHE_TTL_MS) {
    return snapshotCopy<T>(cachedPayload);
  }

  if (inflightRead) {
    const payload = await inflightRead;
    return snapshotCopy<T>(payload);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  inflightRead = (async () => {
    const { data, error } = await supabase
      .from('iso_pro_snapshot')
      .select('payload')
      .eq('id', SNAPSHOT_ID)
      .eq('tenant_id', getActiveTenantId())
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }

    const raw = ((data?.payload ?? {}) as Record<string, unknown>) ?? {};
    const payload = snapshotPayloadFromDatabase(raw);
    cachedPayload = payload;
    cachedAt = Date.now();
    applyRemoteFeatureFlags(raw);
    return payload;
  })();

  try {
    const payload = await inflightRead;
    return snapshotCopy<T>(payload);
  } finally {
    inflightRead = null;
  }
}

export const SNAPSHOT_CONFLICT_MESSAGE =
  'Snapshot foi alterado por outra sessao ou instalacao. Recarregue os dados e tente novamente.';

export class IsoProSnapshotConflictError extends Error {
  readonly code = 'ISO_PRO_SNAPSHOT_CONFLICT' as const;

  constructor(message: string = SNAPSHOT_CONFLICT_MESSAGE) {
    super(message);
    this.name = 'IsoProSnapshotConflictError';
  }
}

export function isIsoProSnapshotConflictError(error: unknown): error is IsoProSnapshotConflictError {
  return error instanceof IsoProSnapshotConflictError;
}

export type IsoProSnapshotWritePlan = {
  nextPayload: Record<string, unknown>;
  baselineUpdatedAt: string | null;
};

export type IsoProSnapshotPatchPlan = {
  patch: Record<string, unknown>;
  baselineUpdatedAt: string | null;
  /** Chaves cujo valor é array e deve ser fundido por `id` no servidor (patch delta). */
  mergeKeys?: readonly string[];
  /** Patch completo (substitui chaves) se o RPC ainda não suportar `p_merge_keys`. */
  patchWithoutMerge?: Record<string, unknown>;
};

function isRpcMergeKeysUnsupported(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? '').toLowerCase();
  return (
    msg.includes('p_merge_keys') ||
    (msg.includes('function') && msg.includes('iso_pro_patch_snapshot') && msg.includes('does not exist'))
  );
}

function isAtendimentoDeltaPatch(mergeKeys?: readonly string[]): boolean {
  if (!mergeKeys?.length) return false;
  const set = new Set(mergeKeys);
  return set.has('documentos') && set.has('atendimentoHistorico');
}

function extractAtendimentoMobileRpcArgs(patch: Record<string, unknown>): Record<string, unknown> {
  const cfg = patch.configuracoesSistema as Record<string, unknown> | undefined;
  const seq = cfg?.sequenciaAtendimento;
  const args: Record<string, unknown> = {
    p_tenant_id: getActiveTenantId(),
  };
  if (patch.documentos != null) args.p_documentos = patch.documentos;
  if (patch.atendimentoHistorico != null) args.p_historico_novas = patch.atendimentoHistorico;
  if (patch.atendimentoLotes != null) args.p_lotes_novos = patch.atendimentoLotes;
  if (patch.atendimentos != null) args.p_atendimentos = patch.atendimentos;
  if (patch.atendimentoEstornoLog != null) args.p_estorno_log_novas = patch.atendimentoEstornoLog;
  if (typeof seq === 'number' && Number.isFinite(seq)) args.p_sequencia_atendimento = seq;
  return args;
}

async function upsertAtendimentoMobileRpc(
  patch: Record<string, unknown>,
  baselineUpdatedAt: string | null,
): Promise<{ ok: boolean; missing: boolean }> {
  const supabase = getSupabase();
  if (!supabase || baselineUpdatedAt === null) return { ok: false, missing: false };
  const safePatch = assertPayloadSafeForWrite(patch);
  const rpcArgs = {
    ...extractAtendimentoMobileRpcArgs(safePatch as Record<string, unknown>),
    p_baseline: baselineUpdatedAt,
  };
  const { error } = await supabase.rpc('iso_pro_registrar_atendimento_mobile', rpcArgs);
  if (error) {
    if (isRpcMissingError(error)) return { ok: false, missing: true };
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }
  invalidateIsoProSnapshotCache();
  return { ok: true, missing: false };
}

async function upsertIsoProSnapshotPatchRpc(
  patch: Record<string, unknown>,
  baselineUpdatedAt: string | null,
  mergeKeys?: readonly string[],
  patchWithoutMerge?: Record<string, unknown>,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const safePatch = assertPayloadSafeForWrite(patch);
  const atendimentoDelta = isAtendimentoDeltaPatch(mergeKeys);

  if (atendimentoDelta) {
    const mobile = await upsertAtendimentoMobileRpc(safePatch as Record<string, unknown>, baselineUpdatedAt);
    if (mobile.ok) return true;
  }

  const rpcArgs: Record<string, unknown> = {
    p_tenant_id: getActiveTenantId(),
    p_baseline: baselineUpdatedAt,
    p_patch: safePatch,
  };
  if (mergeKeys?.length) {
    rpcArgs.p_merge_keys = [...mergeKeys];
  }
  let { error } = await supabase.rpc('iso_pro_patch_snapshot', rpcArgs);

  if (error && atendimentoDelta) {
    const mobileRetry = await upsertAtendimentoMobileRpc(safePatch as Record<string, unknown>, baselineUpdatedAt);
    if (mobileRetry.ok) return true;
  }

  if (error && mergeKeys?.length && patchWithoutMerge && isRpcMergeKeysUnsupported(error)) {
    if (atendimentoDelta) {
      const mobileFallback = await upsertAtendimentoMobileRpc(
        safePatch as Record<string, unknown>,
        baselineUpdatedAt,
      );
      if (mobileFallback.ok) return true;
    }
    const safeFallback = assertPayloadSafeForWrite(patchWithoutMerge);
    ({ error } = await supabase.rpc('iso_pro_patch_snapshot', {
      p_tenant_id: getActiveTenantId(),
      p_baseline: baselineUpdatedAt,
      p_patch: safeFallback,
    }));
  }
  if (error) {
    if (isRpcMissingError(error)) return false;
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }
  invalidateIsoProSnapshotCache();
  return true;
}

export type SubmitAtendimentoComandoResult =
  | { ok: true; updatedAt: string; usedCommandRpc: boolean }
  | { ok: false; missing: true };

/** Comando idempotente (arquitetura definitiva) — payload minimo KB. */
export async function submitAtendimentoComandoToCloud(
  patch: Record<string, unknown>,
  baselineUpdatedAt: string,
  idempotencyKey: string,
): Promise<SubmitAtendimentoComandoResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, missing: true };
  const safePatch = assertPayloadSafeForWrite(patch);
  const args = extractAtendimentoMobileRpcArgs(safePatch as Record<string, unknown>);

  const commandArgs = {
    ...args,
    p_idempotency_key: idempotencyKey,
    p_baseline: baselineUpdatedAt,
  };
  const { data, error } = await supabase.rpc('iso_pro_submit_atendimento_comando', commandArgs);
  if (!error && data != null) {
    invalidateIsoProSnapshotCache();
    return { ok: true, updatedAt: String(data), usedCommandRpc: true };
  }
  if (error && !isRpcMissingError(error)) {
    if (isSnapshotConflictRpcError(error)) {
      throw new IsoProSnapshotConflictError();
    }
    throw new Error(error.message);
  }

  const mobile = await upsertAtendimentoMobileRpc(safePatch as Record<string, unknown>, baselineUpdatedAt);
  if (mobile.ok) {
    return { ok: true, updatedAt: new Date().toISOString(), usedCommandRpc: false };
  }
  return { ok: false, missing: true };
}

/**
 * Grava apenas chaves alteradas (RPC jsonb merge). Fallback: gravacao completa.
 */
export async function commitIsoProSnapshotPatch(
  prepare: () => Promise<IsoProSnapshotPatchPlan>,
  options?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { patch, baselineUpdatedAt, mergeKeys, patchWithoutMerge } = await prepare();
    try {
      const patched = await upsertIsoProSnapshotPatchRpc(
        patch,
        baselineUpdatedAt,
        mergeKeys,
        patchWithoutMerge,
      );
      if (patched) {
        if (attempt > 0) {
          requestSnapshotRefresh({ reason: 'Gravacao concluida apos sincronizacao com o servidor.' });
        }
        void flushEscalaOutboxBestEffort().catch(() => undefined);
        return;
      }

      const { payload: currentPayload } = await readIsoProSnapshotPayloadForWrite<Record<string, unknown>>();
      await upsertIsoProSnapshotPayload({ ...currentPayload, ...patch }, baselineUpdatedAt);
      if (attempt > 0) {
        requestSnapshotRefresh({ reason: 'Gravacao concluida apos sincronizacao com o servidor.' });
      }
      void flushEscalaOutboxBestEffort().catch(() => undefined);
      return;
    } catch (error) {
      lastError = error;
      if (isIsoProSnapshotConflictError(error) && attempt < maxAttempts - 1) {
        invalidateIsoProSnapshotCache();
        continue;
      }
      if (isIsoProSnapshotConflictError(error)) {
        notifySnapshotConflict({ message: SNAPSHOT_CONFLICT_MESSAGE });
      }
      throw error;
    }
  }

  throw lastError;
}

/**
 * Monta o payload com `prepare` (leitura fresh + merge) e grava com retry se outra sessao alterou o snapshot no meio do caminho.
 */
export async function commitIsoProSnapshotWrite(
  prepare: () => Promise<IsoProSnapshotWritePlan>,
  options?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { nextPayload, baselineUpdatedAt } = await prepare();
    try {
      await upsertIsoProSnapshotPayload(nextPayload, baselineUpdatedAt);
      if (attempt > 0) {
        requestSnapshotRefresh({ reason: 'Gravacao concluida apos sincronizacao com o servidor.' });
      }
      void flushEscalaOutboxBestEffort().catch(() => undefined);
      return;
    } catch (error) {
      lastError = error;
      if (isIsoProSnapshotConflictError(error) && attempt < maxAttempts - 1) {
        invalidateIsoProSnapshotCache();
        continue;
      }
      if (isIsoProSnapshotConflictError(error)) {
        notifySnapshotConflict({ message: SNAPSHOT_CONFLICT_MESSAGE });
      }
      throw error;
    }
  }

  throw lastError;
}

export async function upsertIsoProSnapshotPayload(
  nextPayload: Record<string, unknown>,
  baselineUpdatedAt: string | null,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const safePayload = assertPayloadSafeForWrite(nextPayload);
  const nextUpdatedAt = new Date().toISOString();

  if (baselineUpdatedAt === null) {
    const { error } = await supabase.from('iso_pro_snapshot').upsert(
      {
        id: SNAPSHOT_ID,
        tenant_id: getActiveTenantId(),
        payload: safePayload,
        updated_at: nextUpdatedAt,
      },
      { onConflict: 'id,tenant_id' },
    );

    if (error) {
      throw new Error(error.message);
    }

    invalidateIsoProSnapshotCache();
    return;
  }

  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .update({
      payload: safePayload,
      updated_at: nextUpdatedAt,
    })
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', getActiveTenantId())
    .eq('updated_at', baselineUpdatedAt)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) {
    throw new IsoProSnapshotConflictError();
  }

  invalidateIsoProSnapshotCache();
}
