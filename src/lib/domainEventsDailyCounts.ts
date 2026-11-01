import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export type DomainEventDailyCount = {
  day: string;
  event_type: string;
  count: number;
};

export type DomainEventTypeTotal = {
  event_type: string;
  count: number;
};

export type ListDomainEventsDailyCountsResult = {
  days: DomainEventDailyCount[];
  totals: DomainEventTypeTotal[];
  from?: string;
  to?: string;
  windowDays: number;
  error?: string;
};

/**
 * Rollup P2: contagens diárias / totais por event_type (últimos N dias).
 */
export async function listDomainEventsDailyCounts(opts?: {
  days?: number;
}): Promise<ListDomainEventsDailyCountsResult> {
  const windowDays = opts?.days ?? 30;
  if (!hasSupabaseConfig()) {
    return { days: [], totals: [], windowDays, error: 'supabase_nao_configurado' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { days: [], totals: [], windowDays, error: 'supabase_indisponivel' };
  }

  const { data, error } = await supabase.rpc('iso_pro_domain_events_daily_counts', {
    p_tenant_id: getActiveTenantId(),
    p_days: windowDays,
  });

  if (error) {
    return { days: [], totals: [], windowDays, error: error.message };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  if (typeof raw._error === 'string' && raw._error) {
    return { days: [], totals: [], windowDays, error: raw._error };
  }

  const daysRaw = Array.isArray(raw.days) ? raw.days : [];
  const totalsRaw = Array.isArray(raw.totals) ? raw.totals : [];

  const days: DomainEventDailyCount[] = daysRaw
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        day: String(r.day ?? ''),
        event_type: String(r.event_type ?? ''),
        count: Number(r.count) || 0,
      };
    })
    .filter((r) => r.day && r.event_type);

  const totals: DomainEventTypeTotal[] = totalsRaw
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        event_type: String(r.event_type ?? ''),
        count: Number(r.count) || 0,
      };
    })
    .filter((r) => r.event_type)
    .sort((a, b) => b.count - a.count || a.event_type.localeCompare(b.event_type));

  return {
    days,
    totals,
    from: typeof raw._from === 'string' ? raw._from : undefined,
    to: typeof raw._to === 'string' ? raw._to : undefined,
    windowDays: typeof raw._days === 'number' ? raw._days : windowDays,
  };
}
