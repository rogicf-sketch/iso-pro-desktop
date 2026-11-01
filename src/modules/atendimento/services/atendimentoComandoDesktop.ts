import {
  isIsoProSnapshotConflictError,
  peekAtendimentoComandoConfirmado,
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

/** Retry so em conflito OCC. Timeout: reconcile por peek, sem 2.o RPC cego. */
const CONFLICT_RETRY_MAX = 2;
const RECONCILE_AFTER_TIMEOUT_ROUNDS = 20;
const RECONCILE_AFTER_TIMEOUT_GAP_MS = 400;

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

/**
 * Apos timeout do cliente, a RPC pode ainda ter gravado. Confirma pela chave
 * de idempotencia (snapshot_updated_at preenchido = sucesso).
 */
export async function confirmarComandoAtendimentoPorIdempotencia(
  idempotencyKey: string,
): Promise<string | null> {
  const key = idempotencyKey.trim();
  if (!key) return null;

  for (let round = 0; round < RECONCILE_AFTER_TIMEOUT_ROUNDS; round += 1) {
    try {
      // Peek anon — nao usar SELECT com JWT (claim tenant quebrava o reconcile).
      const at = await peekAtendimentoComandoConfirmado(key);
      if (at) {
        atendimentoCloudBaselineCursor = at;
        return at;
      }
    } catch {
      /* ignore — tenta de novo */
    }
    if (round < RECONCILE_AFTER_TIMEOUT_ROUNDS - 1) {
      await delayMs(RECONCILE_AFTER_TIMEOUT_GAP_MS);
    }
  }
  return null;
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
    // Sem baseline: patch completo demora 40–60s em obra grande — falha rapida.
    return {
      error: 'Nao foi possivel alinhar a versao da nuvem. Recarregue a pagina (Ctrl+F5) e tente de novo.',
      conflict: false,
      updatedAt: null,
    };
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
      // Baixa e estorno: nao cair no patch_snapshot pesado (historico inteiro → 40–60s).
      const detail =
        'error' in result && result.error
          ? result.error
          : ehEstorno
            ? 'Nao foi possivel gravar o estorno na nuvem (comando indisponivel). Tente de novo.'
            : 'Nao foi possivel gravar a retirada na nuvem (comando indisponivel). Recarregue e tente de novo.';
      return {
        error: detail,
        conflict: false,
        updatedAt: null,
      };
    } catch (err) {
      if (isIsoProSnapshotConflictError(err)) {
        return {
          error: err instanceof Error ? err.message : 'Conflito de snapshot.',
          conflict: true,
          updatedAt: null,
        };
      }
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar atendimento.';
      // Timeout do browser: a RPC pode ter concluido no servidor — confirmar pela chave.
      if (isErroTransienteNuvem(msg)) {
        const confirmedAt = await confirmarComandoAtendimentoPorIdempotencia(input.idempotencyKey);
        if (confirmedAt) {
          return { error: null, conflict: false, updatedAt: confirmedAt };
        }
      }
      return {
        error: msg,
        conflict: false,
        updatedAt: null,
      };
    }
  }

  if (!deltaAtendimentoTemConteudoPatch(input.patch)) {
    return { error: null, conflict: false, updatedAt: input.baselineUpdatedAt };
  }

  // Sem delta de comando: so estorno legado usava patch; baixa nova exige comando.
  return {
    error: ehEstorno
      ? 'Nao foi possivel gravar o estorno na nuvem. Recarregue e tente de novo.'
      : 'Nao foi possivel gravar a retirada na nuvem. Recarregue a pagina e tente de novo.',
    conflict: false,
    updatedAt: null,
  };
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
        // Nao repetir o RPC (duplicava 8–20s). Ultima passagem de peek anon pela chave.
        const confirmedAt = await confirmarComandoAtendimentoPorIdempotencia(idempotencyKey);
        if (confirmedAt) {
          setAtendimentoCloudBaselineCursor(confirmedAt);
          return;
        }
        lastError = new Error(
          'A nuvem demorou a responder. Abra Historico e confira se o lote ja apareceu; se nao, clique Confirmar de novo (nao duplica).',
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
