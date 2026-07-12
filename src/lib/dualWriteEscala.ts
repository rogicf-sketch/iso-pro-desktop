import { captureOperationalEvent } from './errorReporting';

/**
 * Dual-write snapshot → tabelas de escala: falhas deixam de ser silenciosas.
 * Snapshot continua a ser a fonte de verdade; a falha fica registada para o painel.
 */

export type DualWriteDomain =
  | 'documentos'
  | 'recebimentos'
  | 'inventarios'
  | 'rir'
  | 'rnc';

export type DualWriteFailureRecord = {
  domain: DualWriteDomain;
  error: string;
  at: string;
};

const STORAGE_KEY = 'iso-pro-desktop-dual-write-failures-v1';
const MAX_FAILURES = 20;

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

function readFailures(): DualWriteFailureRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DualWriteFailureRecord[]) : [];
  } catch {
    return [];
  }
}

function writeFailures(items: DualWriteFailureRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_FAILURES)));
  } catch {
    /* ignore quota */
  }
}

export function listDualWriteFailures(): DualWriteFailureRecord[] {
  return readFailures();
}

export function clearDualWriteFailures(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function recordDualWriteSuccess(domain: DualWriteDomain): void {
  writeFailures(readFailures().filter((f) => f.domain !== domain));
}

export function recordDualWriteFailure(domain: DualWriteDomain, error: string): void {
  if (isRpcMissingError(error)) {
    /* RPC ainda não deployada — não alarmar o painel */
    console.warn(`[dual-write:${domain}] RPC em falta (ignorado no painel):`, error);
    return;
  }
  const next: DualWriteFailureRecord = {
    domain,
    error: error.slice(0, 500),
    at: new Date().toISOString(),
  };
  const without = readFailures().filter((f) => f.domain !== domain);
  writeFailures([next, ...without]);
  console.warn(`[dual-write:${domain}]`, error);
  captureOperationalEvent('dual_write_failure', { domain, error: next.error }, 'error');
}

export type DualWriteRunResult = { ok: boolean; error?: string; skippedMissingRpc?: boolean };

/** Executa dual-write best-effort e regista sucesso/falha visível. */
export async function runDualWriteBestEffort(
  domain: DualWriteDomain,
  fn: () => Promise<{ ok: boolean; error?: string } | void>,
): Promise<DualWriteRunResult> {
  try {
    const result = await fn();
    if (result && result.ok === false) {
      const err = result.error ?? 'Falha no dual-write.';
      if (isRpcMissingError(err)) {
        return { ok: false, error: err, skippedMissingRpc: true };
      }
      recordDualWriteFailure(domain, err);
      return { ok: false, error: err };
    }
    recordDualWriteSuccess(domain);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRpcMissingError(message)) {
      return { ok: false, error: message, skippedMissingRpc: true };
    }
    recordDualWriteFailure(domain, message);
    return { ok: false, error: message };
  }
}
