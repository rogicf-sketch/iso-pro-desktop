import * as Sentry from '@sentry/react';
import { recordOperationalSlo, type OperationalSloEvent } from './operationalSlo';

/**
 * Erros e eventos operacionais para o Sentry (`VITE_SENTRY_DSN`).
 * Sem DSN: só console (dev/warn). Contadores locais de SLO sempre.
 */

function sentryEnabled(): boolean {
  return Boolean(import.meta.env.VITE_SENTRY_DSN?.trim()) && import.meta.env.MODE !== 'test';
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (sentryEnabled()) {
    const err =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    Sentry.captureException(err, { extra: context });
  }

  if (import.meta.env.DEV) {
    console.warn('[iso-pro-desktop]', context ?? {}, error);
    return;
  }

  console.error('[iso-pro-desktop]', context ?? {}, error);
}

export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
  level: 'info' | 'warning' | 'error' = 'warning',
): void {
  if (sentryEnabled()) {
    const eventName = typeof context?.event === 'string' ? context.event : undefined;
    const domain = typeof context?.domain === 'string' ? context.domain : undefined;
    const extra = {
      ...context,
      operationalMessage: true,
      ...(eventName ? { iso_event: eventName } : {}),
      ...(domain ? { iso_domain: domain } : {}),
    };
    const tags: Record<string, string> = {};
    if (eventName) tags.iso_event = eventName;
    if (domain) tags.iso_domain = domain;
    if (level === 'error') {
      Sentry.captureException(new Error(message), { level, tags, extra });
    } else {
      Sentry.captureMessage(message, { level, tags, extra });
    }
  }

  const line = ['[iso-pro-desktop]', message] as const;
  if (import.meta.env.DEV || level !== 'error') {
    console.warn(...line, context ?? {});
    return;
  }
  console.error(...line, context ?? {});
}

const SLO_EVENTS = new Set<string>([
  'snapshot_conflict',
  'dual_write_failure',
  'offline_flush',
  'outbox_flush_fail',
  'mfa_challenge',
  'estorno_ok',
  'estorno_timeout',
  'estorno_conflict',
  'estorno_network',
  'estorno_late_confirm',
  'estorno_idempotent_hit',
  'sot_fallback',
  'lock_long',
  'reconcile_ok',
  'reconcile_fail',
  'sot_divergence',
]);

/** Sucesso / ruído: SLO local sim; Sentry Issues não (evita spam unresolved). */
const SENTRY_SKIP_EVENTS = new Set<string>([
  'reconcile_ok',
  'estorno_ok',
  'estorno_idempotent_hit',
  'mfa_challenge',
]);

/** Evento operacional nomeado (conflito snapshot, dual-write, fila offline). */
export function captureOperationalEvent(
  event: string,
  context?: Record<string, unknown>,
  level: 'info' | 'warning' | 'error' = 'warning',
): void {
  if (SLO_EVENTS.has(event)) {
    recordOperationalSlo(event as OperationalSloEvent);
  }
  if (SENTRY_SKIP_EVENTS.has(event) && level !== 'error') {
    if (import.meta.env.DEV) {
      console.warn(`[iso-pro-desktop] iso.${event}`, context ?? {});
    }
    return;
  }
  captureMessage(`iso.${event}`, { ...context, event }, level);
}
