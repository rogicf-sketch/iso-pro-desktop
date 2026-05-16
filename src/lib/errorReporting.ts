import * as Sentry from '@sentry/react';

/**
 * Erros para o Sentry via SDK (`@sentry/react`) quando `VITE_SENTRY_DSN` está definido e o SDK foi inicializado.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (dsn && import.meta.env.MODE !== 'test') {
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
