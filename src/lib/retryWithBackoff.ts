/**
 * Retry com backoff exponencial + jitter (locks / RPC transitórios).
 * Evita thundering herd e deadlocks por reintento agressivo.
 */

export type RetryBackoffOptions = {
  maxAttempts?: number;
  /** Delay inicial em ms (default 80). */
  baseMs?: number;
  /** Teto de delay em ms (default 2000). */
  maxMs?: number;
  /** Timeout total da operação (default 8000). */
  timeoutMs?: number;
  /** Se retornar true, nao tenta de novo. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (/held|invalid_args|forbidden|401|403|ISO_PRO_SNAPSHOT_CONFLICT/i.test(msg)) return false;
  return /timeout|network|fetch|ECONN|temporar|deadlock|40001|40P01|503|502|429/i.test(msg);
}

/**
 * Executa `fn` com retries. Lança o ultimo erro ou TimeoutError.
 */
export async function withExponentialBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryBackoffOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 4);
  const baseMs = opts.baseMs ?? 80;
  const maxMs = opts.maxMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  const started = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timeout apos ${timeoutMs}ms (retry).`);
    }
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(40, exp));
      await sleep(exp + jitter, opts.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
