import { describe, expect, it, vi } from 'vitest';
import { parseSentryDsn, sendErrorToSentryHttp } from './sentryHttp';

describe('parseSentryDsn', () => {
  it('extrai chave, host e project id', () => {
    const p = parseSentryDsn('https://abc123def4@o12345.ingest.us.sentry.io/987654');
    expect(p).toEqual({
      publicKey: 'abc123def4',
      host: 'o12345.ingest.us.sentry.io',
      projectId: '987654',
    });
  });

  it('devolve null para DSN inválido', () => {
    expect(parseSentryDsn('')).toBeNull();
    expect(parseSentryDsn('not-a-url')).toBeNull();
  });
});

describe('sendErrorToSentryHttp', () => {
  it('envia envelope com fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendErrorToSentryHttp(
      'https://public@o1.ingest.sentry.io/99',
      new Error('falha-teste'),
      { onde: 'unit' },
      'iso-pro-desktop@0.0.0',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://o1.ingest.sentry.io/api/99/envelope/');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('falha-teste');
    expect(String(init.body)).toContain('iso-pro-desktop@0.0.0');

    vi.unstubAllGlobals();
  });
});
