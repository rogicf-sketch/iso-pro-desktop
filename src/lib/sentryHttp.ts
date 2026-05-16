/**
 * Envio mínimo ao Sentry via HTTP (envelope) — usado em testes e como referência.
 * O fluxo da aplicação usa o SDK `@sentry/react` (`errorReporting.ts` + `sentryInit.ts`).
 */

export type ParsedSentryDsn = {
  publicKey: string;
  host: string;
  projectId: string;
};

/** Formato: https://<public_key>@<host>/<project_id> */
export function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
  const raw = String(dsn ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const publicKey = decodeURIComponent(u.username || '');
    const projectId = u.pathname.replace(/^\//, '').replace(/\/$/, '');
    const host = u.host;
    if (!publicKey || !host || !projectId) return null;
    return { publicKey, host, projectId };
  } catch {
    return null;
  }
}

function randomEventId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 32);
}

function toErrorPayload(error: unknown): { type: string; value: string } {
  if (error instanceof Error) {
    return { type: error.name || 'Error', value: error.message || String(error) };
  }
  if (typeof error === 'string') return { type: 'Error', value: error };
  try {
    return { type: 'Error', value: JSON.stringify(error) };
  } catch {
    return { type: 'Error', value: String(error) };
  }
}

function buildEnvelopeBody(
  eventId: string,
  error: unknown,
  extra: Record<string, unknown> | undefined,
  release: string,
): string {
  const sentAt = new Date().toISOString();
  const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: sentAt });
  const ep = toErrorPayload(error);
  const eventPayload = {
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000),
    platform: 'javascript',
    level: 'error',
    release,
    sdk: { name: 'iso-pro.http', version: '1.0' },
    exception: { values: [{ type: ep.type, value: ep.value }] },
    ...(extra && Object.keys(extra).length > 0 ? { extra } : {}),
  };
  const payloadStr = JSON.stringify(eventPayload);
  const itemHeader = JSON.stringify({
    type: 'event',
    length: new TextEncoder().encode(payloadStr).length,
  });
  return `${envelopeHeader}\n${itemHeader}\n\n${payloadStr}\n`;
}

export async function sendErrorToSentryHttp(
  dsn: string,
  error: unknown,
  extra: Record<string, unknown> | undefined,
  release: string,
): Promise<void> {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return;

  const eventId = randomEventId();
  const body = buildEnvelopeBody(eventId, error, extra, release);
  const url = `https://${parsed.host}/api/${parsed.projectId}/envelope/`;
  const sentryClient = release.startsWith('iso-pro-mobile') ? 'iso-pro-mobile-http/1' : 'iso-pro-desktop-http/1';
  const auth = `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=${sentryClient}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': auth,
    },
    body,
    keepalive: true,
  });

  if (!res.ok) {
    throw new Error(`Sentry HTTP ${res.status}`);
  }
}
