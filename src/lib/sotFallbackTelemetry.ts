/**
 * Telemetria de fallback snapshot←SoT e reconciliacao.
 * Dashboard / SLO leem estes contadores locais (24h) + Sentry.
 */

import { captureOperationalEvent } from './errorReporting';
import { recordOperationalSlo } from './operationalSlo';

const STORAGE_KEY = 'iso-pro-desktop-sot-fallback-v1';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 200;

export type SotFallbackDomain =
  | 'rir'
  | 'rnc'
  | 'fornecedores'
  | 'equipamentos'
  | 'etiquetas'
  | 'recebimentos'
  | 'inventarios'
  | 'documentos'
  | 'colaboradores'
  | 'atendimento'
  | 'materiais'
  | 'configuracoes';

export type SotFallbackReason =
  | 'rpc_missing'
  | 'supabase_unavailable'
  | 'network'
  | 'feature_flag_disabled'
  | 'unknown';

export type SotFallbackEvent = {
  at: number;
  domain: SotFallbackDomain;
  reason: SotFallbackReason;
  detail?: string;
  traceId?: string;
};

type Store = { events: SotFallbackEvent[] };

function readStore(): Store {
  if (typeof localStorage === 'undefined') return { events: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { events: [] };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return { events: Array.isArray(parsed.events) ? (parsed.events as SotFallbackEvent[]) : [] };
  } catch {
    return { events: [] };
  }
}

function writeStore(store: Store): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cutoff = Date.now() - WINDOW_MS;
    const events = store.events.filter((e) => e.at >= cutoff).slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events }));
  } catch {
    /* quota */
  }
}

export function newTraceId(prefix = 'iso'): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Regista fallback SoT→snapshot e emite evento operacional. */
export function recordSotFallback(input: {
  domain: SotFallbackDomain;
  reason: SotFallbackReason;
  detail?: string;
  traceId?: string;
}): void {
  const event: SotFallbackEvent = {
    at: Date.now(),
    domain: input.domain,
    reason: input.reason,
    detail: input.detail,
    traceId: input.traceId ?? newTraceId('fb'),
  };
  const store = readStore();
  store.events.push(event);
  writeStore(store);
  recordOperationalSlo('sot_fallback');
  captureOperationalEvent(
    'sot_fallback',
    {
      domain: input.domain,
      reason: input.reason,
      detail: input.detail,
      traceId: event.traceId,
      source: 'sot_fallback_telemetry',
    },
    'warning',
  );
}

export type SotFallbackSummary = {
  total24h: number;
  byDomain: Partial<Record<SotFallbackDomain, number>>;
  byReason: Partial<Record<SotFallbackReason, number>>;
  recent: SotFallbackEvent[];
};

export function getSotFallbackSummary(): SotFallbackSummary {
  const cutoff = Date.now() - WINDOW_MS;
  const events = readStore().events.filter((e) => e.at >= cutoff);
  const byDomain: SotFallbackSummary['byDomain'] = {};
  const byReason: SotFallbackSummary['byReason'] = {};
  for (const e of events) {
    byDomain[e.domain] = (byDomain[e.domain] ?? 0) + 1;
    byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
  }
  return {
    total24h: events.length,
    byDomain,
    byReason,
    recent: events.slice(-10).reverse(),
  };
}

export function clearSotFallbackEvents(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
