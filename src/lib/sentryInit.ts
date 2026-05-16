import * as Sentry from '@sentry/react';

let didInit = false;

/** SDK Sentry no renderer (web + Electron). Sem `VITE_SENTRY_DSN` não faz nada. */
export function initSentryDesktop(): void {
  if (didInit) return;
  didInit = true;
  if (import.meta.env.MODE === 'test') return;

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  const release =
    typeof __APP_VERSION__ !== 'undefined' ? `iso-pro-desktop@${__APP_VERSION__}` : 'iso-pro-desktop@unknown';

  Sentry.init({
    dsn,
    release,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}
