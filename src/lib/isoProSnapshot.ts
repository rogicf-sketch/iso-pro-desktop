import { parseIsoSnapshotPayloadFromUnknown, type IsoSnapshotPayload } from 'iso-pro-shared';
import { flushEscalaOutboxBestEffort } from './escalaOutbox';
import { getActiveTenantId } from './isoProTenant';
import { getRuntimeSupabaseConfig, getSupabase } from './supabase';
import { invalidateSnapshotDerivedCaches } from './snapshotDerivedCache';
import { notifySnapshotConflict, requestSnapshotRefresh } from './snapshotSessionSync';
import { applyRemoteFeatureFlags } from './featureFlags';
import { applyHistoricoRetencaoAoPayload } from './snapshotHistoricoRetencao';

/**
 * Teto da espera do RPC HTTP. Poll/Realtime podem confirmar antes.
 * Apos este teto o cliente NAO dispara segundo RPC — so reconcilia pela chave.
 */
export const ATENDIMENTO_COMANDO_RPC_TIMEOUT_MS = 6_000;
/** Extra apos timeout: so peek (pedido original continua em fundo). */
export const ATENDIMENTO_COMANDO_RECONCILE_MS = 12_000;
const ATENDIMENTO_COMANDO_POLL_GAP_MS = 300;
const ATENDIMENTO_COMANDO_REALTIME_WAIT_MS = 1_200;
/** Timeout do POST ao gateway BR (VM OCI). */
const ATENDIMENTO_GATEWAY_TIMEOUT_MS = 10_000;

function resolveAtendimentoGatewayUrl(): string | null {
  const override = String(import.meta.env.VITE_ATENDIMENTO_GATEWAY_URL ?? '').trim();
  if (override) return override.replace(/\/$/, '');
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  if (host === 'isoprogestaodemateriais.com.br' || host === 'www.isoprogestaodemateriais.com.br') {
    return `${window.location.origin}/api/atendimento/comando`;
  }
  return null;
}

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
 * Fatia minima para gravar baixa/sessao: so configuracoesSistema (sequencia).
 * Materiais/historico/lotes NAO — obra grande = dezenas de MB e 40–60s.
 * Saldo vem dos agregados RPC + materiais ja no PC.
 */
export const SNAPSHOT_ATENDIMENTO_BAIXA_WRITE_SLICE_KEYS = ['configuracoesSistema'] as const;

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

/** So updated_at (OCC) — caminho quente do Confirmar; evita stats/blob. */
export async function readIsoProSnapshotCursor(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('iso_pro_read_snapshot_cursor', {
    p_tenant_id: getActiveTenantId(),
  });
  if (error) {
    if (isRpcMissingError(error)) {
      const stats = await readIsoProSnapshotStats().catch(() => null);
      return stats?.updatedAt ?? null;
    }
    throw new Error(error.message);
  }
  return data != null ? String(data) : null;
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
  | { ok: false; missing: true; error?: string }
  | { ok: false; missing?: false; error: string };

/**
 * Peek do comando concluido — JWT e anon em paralelo (onda 2: anon ainda permitido).
 * Evita latência em série quando o JWT falha/atrasa.
 */
export async function peekAtendimentoComandoConfirmado(
  idempotencyKey: string,
): Promise<string | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;
  const tenantId = getActiveTenantId();
  const { url, key: anonKey } = getRuntimeSupabaseConfig();
  if (!url || !anonKey) return null;

  const body = JSON.stringify({
    p_tenant_id: tenantId,
    p_idempotency_key: key,
  });

  async function peekWithBearer(
    bearer: string,
    label: string,
  ): Promise<{ ok: true; value: string | null } | { ok: false }> {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/iso_pro_peek_atendimento_comando`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (!res.ok) {
        if (typeof console !== 'undefined' && console.info) {
          console.info(`[atendimento] peek_${label} status=${res.status}`);
        }
        return { ok: false };
      }
      const data: unknown = await res.json();
      if (data != null && data !== '') return { ok: true, value: String(data) };
      return { ok: true, value: null };
    } catch (err) {
      if (typeof console !== 'undefined' && console.info) {
        console.info(`[atendimento] peek_${label} erro`, err instanceof Error ? err.message : err);
      }
      return { ok: false };
    }
  }

  let jwt: string | null = null;
  try {
    const session = await getSupabase()?.auth.getSession();
    jwt = session?.data.session?.access_token ?? null;
  } catch {
    jwt = null;
  }
  if (!jwt) {
    const viaAnon = await peekWithBearer(anonKey, 'anon');
    return viaAnon.ok ? viaAnon.value : null;
  }
  const [viaJwt, viaAnon] = await Promise.all([
    peekWithBearer(jwt, 'jwt'),
    peekWithBearer(anonKey, 'anon'),
  ]);
  if (viaJwt.ok && viaJwt.value) return viaJwt.value;
  if (viaAnon.ok && viaAnon.value) return viaAnon.value;
  if (viaJwt.ok) return viaJwt.value;
  if (viaAnon.ok) return viaAnon.value;
  return null;
}

async function reservarComandoAtendimento(
  idempotencyKey: string,
  baselineUpdatedAt: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('iso_pro_reserve_atendimento_comando', {
      p_tenant_id: getActiveTenantId(),
      p_idempotency_key: idempotencyKey.trim(),
      p_baseline: baselineUpdatedAt,
    });
    if (error) {
      if (!isRpcMissingError(error) && typeof console !== 'undefined' && console.info) {
        console.info('[atendimento] reserve', error.message);
      }
      return null;
    }
    return data != null && data !== '' ? String(data) : null;
  } catch {
    return null;
  }
}

async function subscribeComandoRealtime(
  idempotencyKey: string,
  onDone: (updatedAt: string) => void,
): Promise<() => void> {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;
  const key = idempotencyKey.trim();
  const tenantId = getActiveTenantId();
  const channelName = `atend-cmd-${key.slice(0, 48)}-${Date.now().toString(36)}`;

  return new Promise((resolve) => {
    let settled = false;
    const finishSubscribe = (teardown: () => void) => {
      if (settled) return;
      settled = true;
      resolve(teardown);
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'iso_pro_atendimento_comandos',
          filter: `idempotency_key=eq.${key}`,
        },
        (payload) => {
          const row = payload.new as { snapshot_updated_at?: string | null; tenant_id?: string } | null;
          if (!row?.snapshot_updated_at) return;
          if (row.tenant_id && row.tenant_id !== tenantId) return;
          onDone(String(row.snapshot_updated_at));
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (status !== 'SUBSCRIBED' && typeof console !== 'undefined' && console.info) {
            console.info(`[atendimento] realtime ${status}`);
          }
          finishSubscribe(() => {
            void supabase.removeChannel(channel);
          });
        }
      });

    setTimeout(() => {
      finishSubscribe(() => {
        void supabase.removeChannel(channel);
      });
    }, ATENDIMENTO_COMANDO_REALTIME_WAIT_MS);
  });
}

/**
 * Comando idempotente — payload minimo KB.
 *
 * Producao (host BR): POST /api/atendimento/comando (gateway VM + service role).
 * Fallback (dev / API down): RPC directo + peek reconcile (nunca 2.o POST cego).
 */
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

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const logVia = (channel: 'gateway' | 'rpc', detail: string) => {
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    if (typeof console !== 'undefined' && console.info) {
      console.info(`[atendimento] via=${channel} ${ms}ms ${detail} key=${idempotencyKey}`);
    }
  };

  const gatewayUrl = resolveAtendimentoGatewayUrl();
  // Com gateway: nao peek directo ao Supabase US (pode travar no 4G). O gateway faz peek/ACK.
  if (!gatewayUrl) {
    const already = await peekAtendimentoComandoConfirmado(idempotencyKey);
    if (already) {
      invalidateIsoProSnapshotCache();
      logVia('rpc', 'via=peek');
      return { ok: true, updatedAt: already, usedCommandRpc: true };
    }
  }

  if (gatewayUrl) {
    try {
      const gw = await submitAtendimentoComandoViaGateway(gatewayUrl, commandArgs, idempotencyKey);
      if (gw.ok) {
        invalidateIsoProSnapshotCache();
        logVia('gateway', `via=${gw.detail}`);
        return { ok: true, updatedAt: gw.updatedAt, usedCommandRpc: true };
      }
      if (gw.conflict) throw new IsoProSnapshotConflictError();
      // 401/403: nao cair em RPC com a mesma sessao morta (evita ruido e falsa esperanca).
      if (/sessao|jwt|expirad|permissao|obrigatoria/i.test(gw.error)) {
        return { ok: false, error: gw.error };
      }
      if (typeof console !== 'undefined' && console.info) {
        console.info(`[atendimento] gateway falhou (${gw.error}) — fallback rpc`);
      }
    } catch (err) {
      if (err instanceof IsoProSnapshotConflictError) throw err;
      const peeked = await peekAtendimentoComandoConfirmado(idempotencyKey);
      if (peeked) {
        invalidateIsoProSnapshotCache();
        logVia('gateway', 'via=reconcile');
        return { ok: true, updatedAt: peeked, usedCommandRpc: true };
      }
      if (typeof console !== 'undefined' && console.info) {
        console.info(
          `[atendimento] gateway erro (${err instanceof Error ? err.message : 'falha'}) — fallback rpc`,
        );
      }
    }
  }

  return submitAtendimentoComandoViaDirectRpc(safePatch, baselineUpdatedAt, idempotencyKey, commandArgs, t0);
}

type GatewaySubmitResult =
  | { ok: true; updatedAt: string; detail: string }
  | { ok: false; error: string; conflict?: boolean };

async function submitAtendimentoComandoViaGateway(
  url: string,
  commandArgs: Record<string, unknown>,
  idempotencyKey: string,
): Promise<GatewaySubmitResult> {
  const supabase = getSupabase();
  let bearer = '';
  try {
    const refreshed = await supabase?.auth.refreshSession();
    const token =
      refreshed?.data.session?.access_token ??
      (await supabase?.auth.getSession())?.data.session?.access_token;
    if (token) bearer = token;
  } catch {
    /* sem sessao */
  }
  if (!bearer) {
    return {
      ok: false,
      error: 'Sessao JWT obrigatoria para Confirmar (gateway). Entre novamente.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATENDIMENTO_GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
        'X-Iso-Pro-Client': 'iso-pro-web',
      },
      body: JSON.stringify(commandArgs),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      updatedAt?: string;
      via?: string;
      error?: string;
      conflict?: boolean;
    };
    if (res.ok && payload.ok && payload.updatedAt) {
      return { ok: true, updatedAt: String(payload.updatedAt), detail: payload.via ?? 'rpc' };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: payload.error ?? 'Sessao expirada ou sem permissao no gateway. Entre novamente.',
      };
    }
    if (res.status === 409 || payload.conflict) {
      return { ok: false, error: payload.error ?? 'conflict', conflict: true };
    }
    // Timeout/erro no gateway: reconciliar pela chave (sem 2.o POST).
    const peeked = await peekAtendimentoComandoConfirmado(idempotencyKey);
    if (peeked) {
      return { ok: true, updatedAt: peeked, detail: 'reconcile' };
    }
    return { ok: false, error: payload.error ?? `HTTP ${res.status}` };
  } catch (err) {
    const peeked = await peekAtendimentoComandoConfirmado(idempotencyKey);
    if (peeked) {
      return { ok: true, updatedAt: peeked, detail: 'reconcile' };
    }
    const msg =
      err instanceof Error && err.name === 'AbortError'
        ? 'timeout gateway'
        : err instanceof Error
          ? err.message
          : 'falha gateway';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function submitAtendimentoComandoViaDirectRpc(
  safePatch: Record<string, unknown>,
  baselineUpdatedAt: string,
  idempotencyKey: string,
  commandArgs: Record<string, unknown>,
  t0: number,
): Promise<SubmitAtendimentoComandoResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, missing: true };

  let settled = false;
  let win: 'rpc' | 'poll' | 'realtime' | 'reserve' | 'timeout' = 'timeout';
  let teardownRealtime: (() => void) | undefined;

  const finishOk = (
    updatedAt: string,
    via: 'rpc' | 'poll' | 'realtime' | 'reserve',
  ): SubmitAtendimentoComandoResult => {
    if (settled) {
      return { ok: true, updatedAt, usedCommandRpc: true };
    }
    settled = true;
    win = via;
    try {
      teardownRealtime?.();
    } catch {
      /* ignore */
    }
    invalidateIsoProSnapshotCache();
    return { ok: true, updatedAt, usedCommandRpc: true };
  };

  const waitMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const reservedAt = await reservarComandoAtendimento(idempotencyKey, baselineUpdatedAt);
  if (reservedAt) {
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    if (typeof console !== 'undefined' && console.info) {
      console.info(`[atendimento] via=rpc ${ms}ms via=reserve key=${idempotencyKey}`);
    }
    return finishOk(reservedAt, 'reserve');
  }

  // RPC imediatamente; Realtime em paralelo (sem bloquear o POST).
  let realtimeResolve: ((v: SubmitAtendimentoComandoResult | null) => void) | undefined;
  const realtimePromise = new Promise<SubmitAtendimentoComandoResult | null>((resolve) => {
    realtimeResolve = resolve;
  });
  void subscribeComandoRealtime(idempotencyKey, (updatedAt) => {
    realtimeResolve?.(finishOk(updatedAt, 'realtime'));
  }).then((teardown) => {
    teardownRealtime = teardown;
  });

  const rpcPromise = (async (): Promise<SubmitAtendimentoComandoResult> => {
    try {
      const { data, error } = await supabase.rpc('iso_pro_submit_atendimento_comando', commandArgs);
      if (settled) {
        return { ok: true, updatedAt: String(data ?? baselineUpdatedAt), usedCommandRpc: true };
      }
      if (!error && data != null) {
        return finishOk(String(data), 'rpc');
      }
      if (error && !isRpcMissingError(error)) {
        if (isSnapshotConflictRpcError(error)) {
          throw new IsoProSnapshotConflictError();
        }
        throw new Error(error.message);
      }
      const mobile = await upsertAtendimentoMobileRpc(safePatch as Record<string, unknown>, baselineUpdatedAt);
      if (mobile.ok) {
        return finishOk(new Date().toISOString(), 'rpc');
      }
      return { ok: false, missing: true };
    } catch (err) {
      if (settled) {
        return { ok: true, updatedAt: baselineUpdatedAt, usedCommandRpc: true };
      }
      throw err;
    }
  })();

  const pollUntil = async (deadlineMs: number): Promise<SubmitAtendimentoComandoResult | null> => {
    while (!settled && (typeof performance !== 'undefined' ? performance.now() : Date.now()) < deadlineMs) {
      const at = await peekAtendimentoComandoConfirmado(idempotencyKey);
      if (at) return finishOk(at, 'poll');
      await waitMs(ATENDIMENTO_COMANDO_POLL_GAP_MS);
    }
    return null;
  };

  const hang = () => new Promise<SubmitAtendimentoComandoResult>(() => undefined);

  try {
    const raced = await Promise.race([
      rpcPromise.then((v) => (v.ok ? v : hang())),
      pollUntil(t0 + ATENDIMENTO_COMANDO_RPC_TIMEOUT_MS).then((v) => v ?? hang()),
      realtimePromise.then((v) => v ?? hang()),
      waitMs(ATENDIMENTO_COMANDO_RPC_TIMEOUT_MS).then(() => {
        throw new Error('Timeout ao consultar nuvem');
      }),
    ]);
    if (raced.ok) return raced;
  } catch (err) {
    if (settled) {
      return { ok: true, updatedAt: baselineUpdatedAt, usedCommandRpc: true };
    }
    // Nao repetir RPC: so peek pela chave ate reconciliar.
    if (typeof console !== 'undefined' && console.info) {
      console.info('[atendimento] http_lento — reconcile exclusivo por peek anon');
    }
    const reconciled = await pollUntil(
      t0 + ATENDIMENTO_COMANDO_RPC_TIMEOUT_MS + ATENDIMENTO_COMANDO_RECONCILE_MS,
    );
    if (reconciled?.ok) return reconciled;
    const last = await peekAtendimentoComandoConfirmado(idempotencyKey);
    if (last) return finishOk(last, 'poll');
    throw err instanceof Error ? err : new Error('Timeout ao consultar nuvem');
  } finally {
    try {
      teardownRealtime?.();
    } catch {
      /* ignore */
    }
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    if (typeof console !== 'undefined' && console.info) {
      console.info(`[atendimento] via=rpc ${ms}ms via=${win} key=${idempotencyKey}`);
    }
  }

  const last = await peekAtendimentoComandoConfirmado(idempotencyKey);
  if (last) return finishOk(last, 'poll');
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
    if (
      Array.isArray((patch as { atendimentoHistorico?: unknown }).atendimentoHistorico) ||
      Array.isArray((patch as { atendimentos?: unknown }).atendimentos)
    ) {
      applyHistoricoRetencaoAoPayload(patch as { atendimentoHistorico?: unknown; atendimentos?: unknown });
    }
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
