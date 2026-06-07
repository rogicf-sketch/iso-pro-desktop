import { describe, expect, it } from 'vitest';

/** Canais IPC expostos no preload — regressao se alguém remover sem actualizar testes. */
const EXPECTED_DESKTOP_IPC_CHANNELS = [
  'desktop-rir:gerar-pdf-bytes',
  'desktop-rir:diagnosticar-fontes',
  'desktop-pdf:html-bytes',
  'desktop-pdf:report',
  'desktop-print:report-pdf',
  'desktop-preview:html',
  'desktop-preview:html-begin',
  'desktop-print:html',
  'desktop-print:visible',
  'desktop-pdf:html',
  'desktop-pdf:visible',
  'desktop-pdf:rir',
  'desktop-print:rir-pdf',
  'desktop-preview:rir-pdf',
  'desktop-pdf:open-external',
] as const;

function isNonEmptyChannel(channel: unknown): channel is string {
  return typeof channel === 'string' && channel.trim().length > 0;
}

describe('Electron IPC channel guards', () => {
  it('lista canais esperados sem duplicados', () => {
    const set = new Set(EXPECTED_DESKTOP_IPC_CHANNELS);
    expect(set.size).toBe(EXPECTED_DESKTOP_IPC_CHANNELS.length);
    for (const ch of EXPECTED_DESKTOP_IPC_CHANNELS) {
      expect(isNonEmptyChannel(ch)).toBe(true);
      expect(ch.startsWith('desktop-')).toBe(true);
    }
  });
});
