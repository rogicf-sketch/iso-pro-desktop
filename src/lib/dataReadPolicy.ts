import { isIsoProDesktop } from './pdfCloud/pdfCloudConfig';
import { hasSupabaseConfig } from './supabase';

/** Tempo maximo para tentativa de leitura remota antes de cair no snapshot local. */
export const REMOTE_READ_TIMEOUT_MS = 4_000;

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

/** Leitura remota com fallback silencioso para o armazenamento local. */
export async function readRemoteOrLocal<T>(options: {
  readRemote: () => Promise<T>;
  readLocal: () => T | Promise<T>;
}): Promise<T> {
  if (!shouldTryRemoteRead()) {
    return await options.readLocal();
  }
  try {
    return await withRemoteReadTimeout(options.readRemote);
  } catch {
    return await options.readLocal();
  }
}
