import { isIsoProDesktop } from './pdfCloud/pdfCloudConfig';
import { hasSupabaseConfig } from './supabase';

/** Tempo maximo absoluto para tentativa de leitura remota (reconciliação). */
export const REMOTE_READ_TIMEOUT_MS = 15_000;
/** Historico / fatias maiores no Atendimento (web) — evita falso "nao leu a nuvem". */
export const REMOTE_READ_TIMEOUT_HEAVY_MS = 25_000;
/**
 * Janela stale-while-revalidate: se a nuvem nao responder neste prazo,
 * serve-se o local de imediato (nao se espera o timeout completo na UI).
 */
export const REMOTE_READ_PREFER_MS = 450;

/**
 * Indica se a aplicacao deve tentar Supabase antes do armazenamento local.
 * No desktop a fonte operacional e o snapshot local; a nuvem sincroniza em segundo plano.
 */
export function shouldTryRemoteRead(): boolean {
  if (!hasSupabaseConfig()) return false;
  if (isIsoProDesktop()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

export async function withRemoteReadTimeout<T>(loader: () => Promise<T>, timeoutMs = REMOTE_READ_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loader(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout ao consultar nuvem')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type RemoteRaceOk<T> = { kind: 'ok'; data: T };
type RemoteRaceErr = { kind: 'err'; error: unknown };
type RemoteRacePrefer = { kind: 'prefer' };

/**
 * Leitura remota com stale-while-revalidate:
 * - arranca remoto + local em paralelo
 * - se remoto chegar dentro de `preferMs`, usa remoto
 * - se nao, devolve local de imediato (sem esperar `REMOTE_READ_TIMEOUT_MS` na UI)
 * - se remoto falhar antes do prefer, devolve local
 */
export async function readRemoteOrLocal<T>(options: {
  readRemote: () => Promise<T>;
  readLocal: () => T | Promise<T>;
  preferMs?: number;
  timeoutMs?: number;
}): Promise<T> {
  if (!shouldTryRemoteRead()) {
    return await options.readLocal();
  }

  const preferMs = options.preferMs ?? REMOTE_READ_PREFER_MS;
  const timeoutMs = options.timeoutMs ?? REMOTE_READ_TIMEOUT_MS;
  const localPromise = Promise.resolve().then(() => options.readLocal());
  // Se o remoto vencer a corrida, a promise local pode rejeitar mais tarde sem ninguem
  // a aguardar — marca como tratada para nao gerar unhandled rejection.
  localPromise.catch(() => undefined);
  const remotePromise = withRemoteReadTimeout(options.readRemote, timeoutMs)
    .then((data): RemoteRaceOk<T> => ({ kind: 'ok', data }))
    .catch((error: unknown): RemoteRaceErr => ({ kind: 'err', error }));

  const raced: RemoteRaceOk<T> | RemoteRaceErr | RemoteRacePrefer = await Promise.race([
    remotePromise,
    delay(preferMs).then((): RemoteRacePrefer => ({ kind: 'prefer' })),
  ]);

  if (raced.kind === 'ok') return raced.data;
  if (raced.kind === 'err') return await localPromise;
  return await localPromise;
}
