import { describe, expect, it } from 'vitest';
import { normalizarDataFlexivelParaIso } from './normalizeFlexibleDateToIso';

describe('normalizarDataFlexivelParaIso', () => {
  it('mantem yyyy-mm-dd valido', () => {
    expect(normalizarDataFlexivelParaIso('2026-04-09')).toBe('2026-04-09');
  });

  it('converte dd/mm/aaaa (Excel BR)', () => {
    expect(normalizarDataFlexivelParaIso('09/04/2026')).toBe('2026-04-09');
    expect(normalizarDataFlexivelParaIso('9/4/2026')).toBe('2026-04-09');
  });

  it('converte dd-mm-aaaa', () => {
    expect(normalizarDataFlexivelParaIso('09-04-2026')).toBe('2026-04-09');
  });

  it('retorna vazio para texto invalido', () => {
    expect(normalizarDataFlexivelParaIso('')).toBe('');
    expect(normalizarDataFlexivelParaIso('   ')).toBe('');
    expect(normalizarDataFlexivelParaIso('not-a-date')).toBe('');
  });

  it('rejeita yyyy-mm-dd invalido', () => {
    expect(normalizarDataFlexivelParaIso('2026-02-31')).toBe('');
  });
});
