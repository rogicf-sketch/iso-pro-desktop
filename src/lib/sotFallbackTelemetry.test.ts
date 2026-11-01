import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSotFallbackEvents,
  getSotFallbackSummary,
  recordSotFallback,
} from './sotFallbackTelemetry';

describe('sotFallbackTelemetry', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          store = {};
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
    clearSotFallbackEvents();
  });
  afterEach(() => {
    clearSotFallbackEvents();
    vi.unstubAllGlobals();
  });

  it('agrega fallbacks por dominio e razao', () => {
    recordSotFallback({ domain: 'rir', reason: 'rpc_missing', detail: 'PGRST202', traceId: 't1' });
    recordSotFallback({ domain: 'rir', reason: 'rpc_missing', traceId: 't2' });
    recordSotFallback({ domain: 'rnc', reason: 'feature_flag_disabled', traceId: 't3' });
    const s = getSotFallbackSummary();
    expect(s.total24h).toBe(3);
    expect(s.byDomain.rir).toBe(2);
    expect(s.byDomain.rnc).toBe(1);
    expect(s.byReason.rpc_missing).toBe(2);
    expect(s.recent[0]?.traceId).toBeTruthy();
  });
});
