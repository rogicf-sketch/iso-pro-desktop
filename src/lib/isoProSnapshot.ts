import { getSupabase } from './supabase';

/** Leitura em cache, gravacao com baseline `updated_at` e retry em conflito de versao (`iso_pro_snapshot`). */
const SNAPSHOT_ID = 'default';
const SNAPSHOT_CACHE_TTL_MS = 1500;

let cachedPayload: Record<string, unknown> | null = null;
let cachedAt = 0;
let inflightRead: Promise<Record<string, unknown>> | null = null;

export function invalidateIsoProSnapshotCache() {
  cachedPayload = null;
  cachedAt = 0;
  inflightRead = null;
}

function snapshotCopy<T extends Record<string, unknown>>(payload: Record<string, unknown>): T {
  return structuredClone(payload) as T;
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

  const { data, error } = await supabase.from('iso_pro_snapshot').select('payload, updated_at').eq('id', SNAPSHOT_ID).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  const payload = ((data?.payload ?? {}) as Record<string, unknown>) ?? {};
  cachedPayload = payload;
  cachedAt = Date.now();

  const baselineUpdatedAt = data?.updated_at != null ? String(data.updated_at) : null;
  return { payload: snapshotCopy<T>(payload), baselineUpdatedAt };
}

export async function readIsoProSnapshotPayload<T extends Record<string, unknown>>() {
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
    const { data, error } = await supabase.from('iso_pro_snapshot').select('payload').eq('id', SNAPSHOT_ID).maybeSingle();
    if (error) {
      throw new Error(error.message);
    }

    const payload = ((data?.payload ?? {}) as Record<string, unknown>) ?? {};
    cachedPayload = payload;
    cachedAt = Date.now();
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

/**
 * Monta o payload com `prepare` (leitura fresh + merge) e grava com retry se outra sessao alterou o snapshot no meio do caminho.
 */
export async function commitIsoProSnapshotWrite(
  prepare: () => Promise<IsoProSnapshotWritePlan>,
  options?: { maxAttempts?: number },
): Promise<void> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { nextPayload, baselineUpdatedAt } = await prepare();
    try {
      await upsertIsoProSnapshotPayload(nextPayload, baselineUpdatedAt);
      return;
    } catch (error) {
      lastError = error;
      if (isIsoProSnapshotConflictError(error) && attempt < maxAttempts - 1) {
        continue;
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

  const nextUpdatedAt = new Date().toISOString();

  if (baselineUpdatedAt === null) {
    const { error } = await supabase.from('iso_pro_snapshot').upsert(
      {
        id: SNAPSHOT_ID,
        payload: nextPayload,
        updated_at: nextUpdatedAt,
      },
      { onConflict: 'id' },
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
      payload: nextPayload,
      updated_at: nextUpdatedAt,
    })
    .eq('id', SNAPSHOT_ID)
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
