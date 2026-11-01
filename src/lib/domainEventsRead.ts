import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export type DomainEventListItem = {
  id: string;
  created_at: string;
  event_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  actor_login?: string | null;
  source?: string | null;
};

export type ListDomainEventsResult = {
  events: DomainEventListItem[];
  count: number;
  limit: number;
  error?: string;
};

/**
 * Lista eventos de domínio recentes (P2). Sem payload — para ops/UI futura.
 */
export async function listDomainEvents(opts?: {
  limit?: number;
  eventType?: string;
}): Promise<ListDomainEventsResult> {
  if (!hasSupabaseConfig()) {
    return { events: [], count: 0, limit: opts?.limit ?? 50, error: 'supabase_nao_configurado' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { events: [], count: 0, limit: opts?.limit ?? 50, error: 'supabase_indisponivel' };
  }

  const args: Record<string, unknown> = {
    p_tenant_id: getActiveTenantId(),
    p_limit: opts?.limit ?? 50,
  };
  if (opts?.eventType) args.p_event_type = opts.eventType;

  const { data, error } = await supabase.rpc('iso_pro_list_domain_events', args);

  if (error) {
    return { events: [], count: 0, limit: opts?.limit ?? 50, error: error.message };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  if (typeof raw._error === 'string' && raw._error) {
    return { events: [], count: 0, limit: opts?.limit ?? 50, error: raw._error };
  }

  const events = Array.isArray(raw.events) ? (raw.events as DomainEventListItem[]) : [];
  const count = typeof raw._count === 'number' ? raw._count : events.length;
  const limit = typeof raw._limit === 'number' ? raw._limit : opts?.limit ?? 50;
  return { events, count, limit };
}
