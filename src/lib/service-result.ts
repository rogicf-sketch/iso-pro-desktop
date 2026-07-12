import type { ServiceResult } from '../types/common.types';
import { withRemoteReadTimeout } from './dataReadPolicy';
import { captureOperationalEvent } from './errorReporting';
import { isIsoProSnapshotConflictError } from './isoProSnapshot';
import { isIsoProDesktop } from './pdfCloud/pdfCloudConfig';
import { businessWriteBlockedFailure, isBusinessLocalWriteBlocked } from './writePolicy';
import { traduzirErroOperacionalIsoPro } from './traduzirErroOperacionalIsoPro';
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

export async function withLocalFallback<T>(options: {
  shouldTryRemote: boolean;
  loadRemote: () => Promise<T>;
  loadLocal: () => T | Promise<T>;
  fallbackMessage: string;
}): Promise<{ data: T; meta: NonNullable<ServiceResult<T>['meta']> }> {
  if (!options.shouldTryRemote) {
    return {
      data: await options.loadLocal(),
      meta: {
        source: 'local',
      },
    };
  }

  try {
    return {
      data: await withRemoteReadTimeout(options.loadRemote),
      meta: {
        source: 'supabase',
      },
    };
  } catch (error) {
    const fallbackReason = isIsoProDesktop()
      ? undefined
      : traduzirErroOperacionalIsoPro(getErrorMessage(error, options.fallbackMessage));
    return {
      data: await options.loadLocal(),
      meta: {
        source: 'local',
        ...(fallbackReason ? { fallbackReason } : {}),
      },
    };
  }
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
      options.writeLocal();
      return {
        success: true,
        data: options.successData,
        meta: {
          source: 'supabase',
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

  options.writeLocal();
  return {
    success: true,
    data: options.successData,
    meta: {
      source: 'local',
    },
  };
}
