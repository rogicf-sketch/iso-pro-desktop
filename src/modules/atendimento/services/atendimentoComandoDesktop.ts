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

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Erros de rede/timeout sao seguros de repetir: o comando e idempotente pela chave,
 * entao reenviar nunca duplica a baixa (o servidor devolve o resultado ja gravado).
 */
function isErroTransienteNuvem(message: string | null | undefined): boolean {
  const m = String(message ?? '').toLowerCase();
  return (
    m.includes('timeout') ||
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('econnreset') ||
    m.includes('econnrefused')
  );
}

let syncAtendimentoTail: Promise<unknown> = Promise.resolve();
let atendimentoCloudBaselineCursor: string | null = null;

export function setAtendimentoCloudBaselineCursor(at: string | null): void {
  atendimentoCloudBaselineCursor = at;
}

export function getAtendimentoCloudBaselineCursor(): string | null {
  return atendimentoCloudBaselineCursor;
}

/**
 * Pre-aquece o cursor OCC com RPC leve (so updatedAt, sem baixar JSON).
 * Chamado ao abrir Atendimento para o Confirmar nao precisar ler fatia.
 */
export async function warmAtendimentoCloudBaselineCursor(
  readStats: () => Promise<{ updatedAt: string | null } | null>,
): Promise<void> {
  if (atendimentoCloudBaselineCursor) return;
  try {
    const stats = await readStats();
    if (stats?.updatedAt) {
      atendimentoCloudBaselineCursor = stats.updatedAt;
    }
  } catch {
    /* ignore — Confirmar ainda consegue obter baseline no prepare */
  }
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

  const ehEstorno =
    Array.isArray(input.comandoPatch.atendimentoEstornoLog) &&
    (input.comandoPatch.atendimentoEstornoLog as unknown[]).length > 0;

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
      // Estorno: nao cair no patch_snapshot pesado (historico/atendimentos inteiros) —
      // em obra grande isso estoura timeout e parece que o estorno "nao funciona".
      if (ehEstorno) {
        return {
          error: 'Nao foi possivel gravar o estorno na nuvem (comando indisponivel). Tente de novo.',
          conflict: false,
          updatedAt: null,
        };
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

  if (ehEstorno) {
    return {
      error: 'Nao foi possivel gravar o estorno na nuvem. Recarregue e tente de novo.',
      conflict: false,
      updatedAt: null,
    };
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
      let prepared: Awaited<ReturnType<typeof input.prepare>>;
      try {
        prepared = await input.prepare();
      } catch (err) {
        // Leitura da baseline falhou por rede/timeout: repetir e seguro (ainda nada foi gravado).
        const msg = err instanceof Error ? err.message : '';
        if (isErroTransienteNuvem(msg)) {
          if (attempt < CONFLICT_RETRY_MAX - 1) {
            await delayMs(700 + attempt * 500);
            continue;
          }
          throw new Error(
            'A ligacao com a nuvem esta lenta e a gravacao nao foi concluida. Nada foi registrado — verifique a internet e clique Confirmar de novo.',
          );
        }
        throw err;
      }
      const { baseline, next, idempotencyKey } = prepared;
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
        // Outro dispositivo (ex.: mobile) gravou entre a leitura e o envio — pequena espera antes de reler.
        await delayMs(250 + attempt * 350);
        continue;
      }

      if (outcome.conflict) {
        throw new IsoProSnapshotConflictError(outcome.error ?? SNAPSHOT_CONFLICT_MESSAGE);
      }

      if (isErroTransienteNuvem(outcome.error)) {
        if (attempt < CONFLICT_RETRY_MAX - 1) {
          await delayMs(700 + attempt * 500);
          continue;
        }
        lastError = new Error(
          'A nuvem nao confirmou a gravacao (ligacao lenta). Recarregue a pagina e confira o historico antes de tentar de novo.',
        );
        break;
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
