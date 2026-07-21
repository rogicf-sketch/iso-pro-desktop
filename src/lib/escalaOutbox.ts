import { captureOperationalEvent } from './errorReporting';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';

export type EscalaOutboxDomain =
  | 'documentos'
  | 'recebimentos'
  | 'inventarios'
  | 'rir'
  | 'rnc';

export type EscalaOutboxStatus = {
  pending: number;
  processing: number;
  failed: number;
  done24h: number;
  failures: Array<{
    id?: string;
    domain?: EscalaOutboxDomain | string;
    error?: string | null;
    attempts?: number;
    at?: string | null;
  }>;
};

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

/** Flush best-effort da outbox servidor (após patch snapshot). */
export async function flushEscalaOutboxBestEffort(maxJobs = 5): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.rpc('iso_pro_flush_escala_outbox', {
      p_tenant_id: getActiveTenantId(),
      p_max: maxJobs,
    });
    if (error) {
      if (isRpcMissingError(error.message)) return;
      console.warn('[escala-outbox] flush:', error.message);
      captureOperationalEvent('dual_write_failure', { source: 'outbox_flush', error: error.message }, 'warning');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRpcMissingError(message)) return;
    console.warn('[escala-outbox] flush:', message);
  }
}

/**
 * Garante job pending (reabre failed) para um domínio e faz flush.
 * Usado quando o dual-write directo falha — recuperação via outbox servidor.
 */
export async function ensureEscalaOutboxPendingBestEffort(
  domain: EscalaOutboxDomain,
  reason = 'dual_write_recovery',
): Promise<void> {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.rpc('iso_pro_escala_outbox_ensure_pending', {
      p_tenant_id: getActiveTenantId(),
      p_domain: domain,
      p_reason: reason,
    });
    if (error) {
      if (isRpcMissingError(error.message)) {
        /* migration ainda não aplicada — flush cobre pending do trigger */
        await flushEscalaOutboxBestEffort(8);
        return;
      }
      console.warn('[escala-outbox] ensure_pending:', error.message);
      captureOperationalEvent(
        'dual_write_failure',
        { source: 'outbox_ensure_pending', domain, error: error.message },
        'warning',
      );
    }
    await flushEscalaOutboxBestEffort(8);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRpcMissingError(message)) {
      await flushEscalaOutboxBestEffort(8);
      return;
    }
    console.warn('[escala-outbox] ensure_pending:', message);
  }
}

export async function fetchEscalaOutboxStatus(): Promise<EscalaOutboxStatus | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('iso_pro_escala_outbox_status', {
      p_tenant_id: getActiveTenantId(),
    });
    if (error) {
      if (isRpcMissingError(error.message)) return null;
      console.warn('[escala-outbox] status:', error.message);
      return null;
    }
    if (!data || typeof data !== 'object') return null;
    const row = data as Record<string, unknown>;
    return {
      pending: Number(row.pending ?? 0),
      processing: Number(row.processing ?? 0),
      failed: Number(row.failed ?? 0),
      done24h: Number(row.done24h ?? 0),
      failures: Array.isArray(row.failures) ? (row.failures as EscalaOutboxStatus['failures']) : [],
    };
  } catch {
    return null;
  }
}

let idleFlushStarted = false;

/**
 * Flush automático no boot + intervalo + online/visibility.
 * Idempotente: só uma vez por sessão de página.
 */
export function startEscalaOutboxIdleFlush(opts?: {
  intervalMs?: number;
  maxJobs?: number;
}): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (idleFlushStarted) return () => undefined;
  idleFlushStarted = true;

  const intervalMs = opts?.intervalMs ?? 60_000;
  const maxJobs = opts?.maxJobs ?? 5;

  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void flushEscalaOutboxBestEffort(maxJobs);
  };

  tick();
  const id = window.setInterval(tick, intervalMs);

  function onOnline() {
    tick();
  }
  function onVisibility() {
    if (document.visibilityState === 'visible') tick();
  }

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    idleFlushStarted = false;
    window.clearInterval(id);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
