import {
  commitIsoProSnapshotPatch,
  isIsoProSnapshotConflictError,
  SNAPSHOT_CONFLICT_MESSAGE,
  submitAtendimentoComandoToCloud,
  IsoProSnapshotConflictError,
} from '../../../lib/isoProSnapshot';

import {
  buildDesktopAtendimentoPatchDelta,
  deltaAtendimentoTemConteudoComando,
  deltaAtendimentoTemConteudoPatch,
  type SnapshotSlice,
} from './atendimentoSnapshotPatch';

export type AtendimentoDesktopSyncOutcome = {
  error: string | null;
  conflict: boolean;
  updatedAt: string | null;
};

const CONFLICT_RETRY_MAX = 6;

let syncAtendimentoTail: Promise<unknown> = Promise.resolve();
let atendimentoCloudBaselineCursor: string | null = null;

export function setAtendimentoCloudBaselineCursor(at: string | null): void {
  atendimentoCloudBaselineCursor = at;
}

export function getAtendimentoCloudBaselineCursor(): string | null {
  return atendimentoCloudBaselineCursor;
}

function runExclusiveAtendimentoSync<T>(fn: () => Promise<T>): Promise<T> {
  const resultPromise = syncAtendimentoTail.then(fn, fn);
  syncAtendimentoTail = resultPromise.then(
    () => undefined,
    () => undefined,
  );
  return resultPromise;
}

export function waitForAtendimentoSyncIdle(): Promise<void> {
  return syncAtendimentoTail.then(() => undefined);
}

export function buildDesktopAtendimentoIdempotencyKey(input: {
  atendimentos?: Array<{ id: string; numero: string }>;
  estornoLogIds?: string[];
}): string {
  if (input.estornoLogIds?.length) {
    return `pc-est-${input.estornoLogIds.join('-')}`;
  }
  if (input.atendimentos?.length === 1) {
    const a = input.atendimentos[0]!;
    return `pc-at-${a.id}-${a.numero}`;
  }
  if (input.atendimentos?.length) {
    return `pc-sess-${[...input.atendimentos].map((a) => a.id).sort().join('-')}`;
  }
  return `pc-at-${Date.now()}`;
}

async function syncAtendimentoPatchFallback(input: {
  patch: Record<string, unknown>;
  mergeKeys: readonly string[];
  patchWithoutMerge?: Record<string, unknown>;
  baselineUpdatedAt: string | null;
}): Promise<AtendimentoDesktopSyncOutcome> {
  try {
    await commitIsoProSnapshotPatch(async () => ({
      patch: input.patch,
      baselineUpdatedAt: input.baselineUpdatedAt,
      mergeKeys: input.mergeKeys,
      patchWithoutMerge: input.patchWithoutMerge,
    }));
    return { error: null, conflict: false, updatedAt: new Date().toISOString() };
  } catch (err) {
    if (isIsoProSnapshotConflictError(err)) {
      return {
        error: err instanceof Error ? err.message : 'Conflito de snapshot.',
        conflict: true,
        updatedAt: null,
      };
    }
    return {
      error: err instanceof Error ? err.message : 'Falha ao sincronizar atendimento.',
      conflict: false,
      updatedAt: null,
    };
  }
}

export async function syncAtendimentoComandoDesktop(input: {
  comandoPatch: Record<string, unknown>;
  patch: Record<string, unknown>;
  mergeKeys: readonly string[];
  patchWithoutMerge?: Record<string, unknown>;
  baselineUpdatedAt: string | null;
  idempotencyKey: string;
}): Promise<AtendimentoDesktopSyncOutcome> {
  if (input.baselineUpdatedAt == null) {
    return syncAtendimentoPatchFallback(input);
  }

  if (deltaAtendimentoTemConteudoComando(input.comandoPatch)) {
    try {
      const result = await submitAtendimentoComandoToCloud(
        input.comandoPatch,
        input.baselineUpdatedAt,
        input.idempotencyKey,
      );
      if (result.ok) {
        atendimentoCloudBaselineCursor = result.updatedAt;
        return { error: null, conflict: false, updatedAt: result.updatedAt };
      }
    } catch (err) {
      if (isIsoProSnapshotConflictError(err)) {
        return {
          error: err instanceof Error ? err.message : 'Conflito de snapshot.',
          conflict: true,
          updatedAt: null,
        };
      }
      return {
        error: err instanceof Error ? err.message : 'Falha ao sincronizar atendimento.',
        conflict: false,
        updatedAt: null,
      };
    }
  }

  if (!deltaAtendimentoTemConteudoPatch(input.patch)) {
    return { error: null, conflict: false, updatedAt: input.baselineUpdatedAt };
  }

  return syncAtendimentoPatchFallback(input);
}

/**
 * Gravação serializada com retry OCC — mesma arquitetura do mobile, sem fila offline.
 */
export async function gravarAtendimentoNaNuvemComComando(input: {
  prepare: () => Promise<{
    baseline: SnapshotSliceForWrite;
    next: SnapshotSliceForWrite;
    idempotencyKey: string;
  }>;
}): Promise<void> {
  return runExclusiveAtendimentoSync(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < CONFLICT_RETRY_MAX; attempt++) {
      const { baseline, next, idempotencyKey } = await input.prepare();
      const delta = buildDesktopAtendimentoPatchDelta(baseline.slices, next.slices);

      const outcome = await syncAtendimentoComandoDesktop({
        comandoPatch: delta.comandoPatch,
        patch: delta.patch,
        mergeKeys: delta.mergeKeys,
        patchWithoutMerge: delta.patchWithoutMerge,
        baselineUpdatedAt: baseline.baselineUpdatedAt,
        idempotencyKey,
      });

      if (!outcome.error) {
        if (outcome.updatedAt) setAtendimentoCloudBaselineCursor(outcome.updatedAt);
        return;
      }

      if (outcome.conflict && attempt < CONFLICT_RETRY_MAX - 1) {
        continue;
      }

      if (outcome.conflict) {
        throw new IsoProSnapshotConflictError(outcome.error ?? SNAPSHOT_CONFLICT_MESSAGE);
      }

      lastError = new Error(outcome.error ?? 'Falha ao gravar atendimento na nuvem.');
      break;
    }

    throw lastError instanceof Error ? lastError : new Error('Falha ao gravar atendimento na nuvem.');
  });
}

export type SnapshotSliceForWrite = {
  slices: SnapshotSlice;
  baselineUpdatedAt: string | null;
};
