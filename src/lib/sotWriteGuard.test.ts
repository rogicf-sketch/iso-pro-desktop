import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./isoProFeatureFlags', () => ({
  isFeatureEnabled: vi.fn(),
}));

vi.mock('./sotFallbackTelemetry', () => ({
  recordSotFallback: vi.fn(),
}));

import { isFeatureEnabled } from './isoProFeatureFlags';
import { recordSotFallback } from './sotFallbackTelemetry';
import {
  SotRpcRequiredError,
  assertNoSilentSotFallback,
  resolveSotUnavailable,
} from './sotWriteGuard';

describe('sotWriteGuard', () => {
  beforeEach(() => {
    vi.mocked(isFeatureEnabled).mockReset();
    vi.mocked(recordSotFallback).mockReset();
  });

  it('hard-fail quando sot_require_rpc está on', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    expect(() =>
      resolveSotUnavailable({ domain: 'rir', reason: 'rpc_missing', detail: 'gone' }),
    ).toThrow(SotRpcRequiredError);
    expect(recordSotFallback).toHaveBeenCalled();
  });

  it('devolve missing quando flag off (emergência)', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    const r = resolveSotUnavailable({ domain: 'documentos', reason: 'rpc_missing' });
    expect(r.missing).toBe(true);
  });

  it('assertNoSilentSotFallback bloqueia legado', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
    expect(() => assertNoSilentSotFallback('rir', true)).toThrow(/SoT obrigatório/);
  });
});
