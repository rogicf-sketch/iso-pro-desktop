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
