import type { ServiceResult } from '../types/common.types';
import { REMOTE_READ_PREFER_MS, withRemoteReadTimeout } from './dataReadPolicy';
import { captureOperationalEvent } from './errorReporting';
import { isIsoProSnapshotConflictError } from './isoProSnapshot';
import { businessWriteBlockedFailure, isBusinessLocalWriteBlocked } from './writePolicy';
import { traduzirErroOperacionalIsoPro } from './traduzirErroOperacionalIsoPro';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

/** Indica falha de gravacao por conflito de versao do snapshot (apos retries no cliente). */
export function isSnapshotConflictResult(result: Pick<ServiceResult<unknown>, 'success' | 'meta'>): boolean {
  return result.success === false && result.meta?.snapshotConflict === true;
}

/** Indica falha porque a politica de producao bloqueou gravacao local sem Supabase. */
export function isWriteBlockedResult(result: Pick<ServiceResult<unknown>, 'success' | 'meta'>): boolean {
  return result.success === false && result.meta?.writeBlocked === true;
}

/**
 * Leitura com fallback local. Em web: stale-while-revalidate —
 * nao bloqueia a UI ate REMOTE_READ_TIMEOUT_MS; apos PREFER_MS serve local.
 */
export async function withLocalFallback<T>(options: {
  shouldTryRemote: boolean;
  loadRemote: () => Promise<T>;
  loadLocal: () => T | Promise<T>;
  fallbackMessage: string;
  preferMs?: number;
}): Promise<{ data: T; meta: NonNullable<ServiceResult<T>['meta']> }> {
  if (!options.shouldTryRemote) {
    return {
      data: await options.loadLocal(),
      meta: {
        source: 'local',
      },
    };
  }

  const preferMs = options.preferMs ?? REMOTE_READ_PREFER_MS;
  const localPromise = Promise.resolve().then(() => options.loadLocal());
  const remotePromise = withRemoteReadTimeout(options.loadRemote)
    .then((data) => ({ kind: 'ok' as const, data }))
    .catch((error: unknown) => ({ kind: 'err' as const, error }));

  const raced = await Promise.race([
    remotePromise,
    delay(preferMs).then(() => ({ kind: 'prefer' as const })),
  ]);

  if (raced.kind === 'ok') {
    return {
      data: raced.data,
      meta: {
        source: 'supabase',
      },
    };
  }

  const local = await localPromise;

  if (raced.kind === 'err') {
    const fallbackReason = traduzirErroOperacionalIsoPro(getErrorMessage(raced.error, options.fallbackMessage));
    return {
      data: local,
      meta: {
        source: 'local',
        ...(fallbackReason ? { fallbackReason } : {}),
      },
    };
  }

  // prefer: UI recebe local ja; remoto continua em background so para aquecer/alinhar copia
  void remotePromise.then(async (result) => {
    if (result.kind !== 'ok') return;
    try {
      // no-op structural: callers that writeAll inside loadRemote already persist on success path;
      // this only completes the in-flight request so the connection is not abandoned mid-flight.
      void result.data;
    } catch {
      /* ignore */
    }
  });

  return {
    data: local,
    meta: {
      source: 'local',
      staleWhileRevalidate: true,
    },
  };
}

export async function executeWrite<T>(options: {
  shouldWriteRemote: boolean;
  writeRemote: () => Promise<void>;
  writeLocal: () => void;
  successData: T;
  fallbackMessage: string;
}): Promise<ServiceResult<T>> {
  if (options.shouldWriteRemote) {
    try {
      await options.writeRemote();
      // Nuvem ja gravou: falha de cache local (quota) nao pode virar "erro de salvar"
      // — senao o utilizador clica de novo e cria duplicados.
      let localWarning: string | undefined;
      try {
        options.writeLocal();
      } catch (localErr) {
        localWarning = traduzirErroOperacionalIsoPro(
          getErrorMessage(
            localErr,
            'Gravado na nuvem; cache local deste equipamento nao atualizou (armazenamento cheio).',
          ),
        );
      }
      return {
        success: true,
        data: options.successData,
        warning: localWarning,
        meta: {
          source: 'supabase',
          fallbackReason: localWarning,
        },
      };
    } catch (error) {
      const message = traduzirErroOperacionalIsoPro(getErrorMessage(error, options.fallbackMessage));
      const snapshotConflict = isIsoProSnapshotConflictError(error);
      if (snapshotConflict) {
        captureOperationalEvent('snapshot_conflict', { message }, 'warning');
      }
      return {
        success: false,
        error: message,
        meta: {
          source: 'local',
          fallbackReason: message,
          snapshotConflict,
        },
      };
    }
  }

  if (isBusinessLocalWriteBlocked()) {
    return businessWriteBlockedFailure<T>();
  }

  try {
    options.writeLocal();
  } catch (error) {
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(getErrorMessage(error, options.fallbackMessage)),
      meta: { source: 'local' },
    };
  }
  return {
    success: true,
    data: options.successData,
    meta: {
      source: 'local',
    },
  };
}
