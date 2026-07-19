/**
 * Contadores locais de SLO operacional (24h). Complementa Sentry quando DSN existe.
 * Persistidos em localStorage por instalação — não são métricas multi-posto.
 */

const STORAGE_KEY = 'iso-pro-desktop-operational-slo-v1';
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type OperationalSloEvent =
  | 'snapshot_conflict'
  | 'dual_write_failure'
  | 'offline_flush'
  | 'outbox_flush_fail'
  | 'mfa_challenge'
  | 'estorno_ok'
  | 'estorno_timeout'
  | 'estorno_conflict'
  | 'estorno_network'
  | 'estorno_late_confirm'
  | 'estorno_idempotent_hit';

type SloBucket = {
  at: number;
  event: OperationalSloEvent;
};

type SloStore = {
  events: SloBucket[];
};

function readStore(): SloStore {
  if (typeof localStorage === 'undefined') return { events: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { events: [] };
    const parsed = JSON.parse(raw) as Partial<SloStore>;
    return { events: Array.isArray(parsed.events) ? (parsed.events as SloBucket[]) : [] };
  } catch {
    return { events: [] };
  }
}

function writeStore(store: SloStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cutoff = Date.now() - WINDOW_MS;
    const events = store.events.filter((e) => e.at >= cutoff).slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ events }));
  } catch {
    /* ignore quota */
  }
}

export function recordOperationalSlo(event: OperationalSloEvent): void {
  const store = readStore();
  store.events.push({ at: Date.now(), event });
  writeStore(store);
}

export type OperationalSloSummary = {
  windowHours: number;
  snapshotConflicts: number;
  dualWriteFailures: number;
  outboxFlushFails: number;
  mfaChallenges: number;
  tone: 'ok' | 'warn' | 'danger';
  label: string;
};

export function getOperationalSloSummary(): OperationalSloSummary {
  const cutoff = Date.now() - WINDOW_MS;
  const events = readStore().events.filter((e) => e.at >= cutoff);
  const count = (name: OperationalSloEvent) => events.filter((e) => e.event === name).length;
  const snapshotConflicts = count('snapshot_conflict');
  const dualWriteFailures = count('dual_write_failure') + count('outbox_flush_fail');
  const outboxFlushFails = count('outbox_flush_fail');
  const mfaChallenges = count('mfa_challenge');

  let tone: OperationalSloSummary['tone'] = 'ok';
  let label = 'Estável (24h)';
  if (dualWriteFailures >= 5 || snapshotConflicts >= 10) {
    tone = 'danger';
    label = 'Atenção (24h)';
  } else if (dualWriteFailures >= 1 || snapshotConflicts >= 3) {
    tone = 'warn';
    label = 'Oscilações (24h)';
  }

  return {
    windowHours: 24,
    snapshotConflicts,
    dualWriteFailures,
    outboxFlushFails,
    mfaChallenges,
    tone,
    label,
  };
}

export function clearOperationalSlo(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
