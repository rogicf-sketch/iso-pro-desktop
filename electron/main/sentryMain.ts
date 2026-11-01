/**
 * Sentry no processo principal do Electron — sem SDK pesado (TLS/npm da obra).
 * Usa o envelope HTTP do Sentry quando há DSN (VITE_SENTRY_DSN / SENTRY_DSN / bake).
 */
import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import https from 'node:https';
import { URL } from 'node:url';

declare const __ISO_PRO_SENTRY_DSN__: string | undefined;
declare const __ISO_PRO_APP_VERSION__: string | undefined;

let didInit = false;
let parsedDsn: { host: string; projectId: string; publicKey: string } | null = null;

function resolveDsnRaw(): string {
  const fromEnv = String(process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    if (typeof __ISO_PRO_SENTRY_DSN__ === 'string' && __ISO_PRO_SENTRY_DSN__.trim()) {
      return __ISO_PRO_SENTRY_DSN__.trim();
    }
  } catch {
    /* define ausente no build */
  }
  return '';
}

function parseDsn(dsn: string): { host: string; projectId: string; publicKey: string } | null {
  try {
    // https://<key>@<host>/<project>
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, '').split('/')[0] ?? '';
    if (!publicKey || !projectId || !u.host) return null;
    return { host: u.host, projectId, publicKey };
  } catch {
    return null;
  }
}

function resolveRelease(): string {
  try {
    if (typeof __ISO_PRO_APP_VERSION__ === 'string' && __ISO_PRO_APP_VERSION__) {
      return `iso-pro-desktop@${__ISO_PRO_APP_VERSION__}`;
    }
  } catch {
    /* ignore */
  }
  try {
    return `iso-pro-desktop@${app.getVersion()}`;
  } catch {
    return 'iso-pro-desktop@unknown';
  }
}

/** Idempotente. Sem DSN → no-op. */
export function initSentryMain(): void {
  if (didInit) return;
  didInit = true;
  parsedDsn = parseDsn(resolveDsnRaw());
}

export function captureMainException(
  error: unknown,
  origin: string,
  context?: Record<string, unknown>,
): void {
  if (!didInit) initSentryMain();
  if (!parsedDsn) return;

  const err =
    error instanceof Error
      ? { type: error.name || 'Error', value: error.message, stacktrace: error.stack }
      : { type: 'Error', value: String(error), stacktrace: undefined };

  const eventId = cryptoRandomHex(32);
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    release: resolveRelease(),
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    tags: {
      'iso.process': 'electron-main',
      'iso.origin': origin,
    },
    extra: context ?? {},
    exception: {
      values: [
        {
          type: err.type,
          value: err.value,
          stacktrace: err.stacktrace
            ? {
                frames: String(err.stacktrace)
                  .split('\n')
                  .slice(1, 40)
                  .map((line) => ({ filename: line.trim(), function: '?' })),
              }
            : undefined,
        },
      ],
    },
  };

  const header = JSON.stringify({
    event_id: eventId,
    sent_at: new Date().toISOString(),
    dsn: resolveDsnRaw(),
  });
  const itemHeader = JSON.stringify({ type: 'event', content_type: 'application/json' });
  const body = `${header}\n${itemHeader}\n${JSON.stringify(event)}\n`;

  const { host, projectId, publicKey } = parsedDsn;
  const req = https.request(
    {
      hostname: host,
      path: `/api/${projectId}/envelope/`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'Content-Length': Buffer.byteLength(body),
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=iso-pro-electron-main/1.0, sentry_key=${publicKey}`,
      },
      timeout: 8_000,
    },
    (res) => {
      res.resume();
    },
  );
  req.on('error', () => {
    /* best-effort */
  });
  req.on('timeout', () => {
    req.destroy();
  });
  req.write(body);
  req.end();
}

function cryptoRandomHex(bytes: number): string {
  try {
    return randomBytes(bytes).toString('hex');
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }
}
