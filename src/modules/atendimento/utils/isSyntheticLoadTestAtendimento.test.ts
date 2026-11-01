import { describe, expect, it } from 'vitest';
import {
  isSyntheticLoadTestAtendimento,
  resolveDataAtendimentoIso,
} from './isSyntheticLoadTestAtendimento';

describe('isSyntheticLoadTestAtendimento', () => {
  it('detecta ATD-LOAD e load-at-', () => {
    expect(
      isSyntheticLoadTestAtendimento({
        numero: 'ATD-LOAD-008-R2-1786238489876-lqj6ks',
        id: 'x',
      }),
    ).toBe(true);
    expect(isSyntheticLoadTestAtendimento({ numero: 'ATD-1', id: 'load-at-1-2-x' })).toBe(true);
    expect(isSyntheticLoadTestAtendimento({ numero: 'ATD-1', id: 'real-uuid' })).toBe(false);
  });
});

describe('resolveDataAtendimentoIso', () => {
  it('nao inventa Date.now()', () => {
    expect(resolveDataAtendimentoIso(null)).toBe('');
    expect(resolveDataAtendimentoIso(undefined, '2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z');
    expect(resolveDataAtendimentoIso('2026-08-01T12:00:00.000Z')).toBe('2026-08-01T12:00:00.000Z');
  });
});
