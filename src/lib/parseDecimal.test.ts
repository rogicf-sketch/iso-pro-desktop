import { describe, expect, it } from 'vitest';
import { parseDecimalFlexible } from './parseDecimal';

describe('parseDecimalFlexible', () => {
  it('aceita ponto como decimal', () => {
    expect(parseDecimalFlexible('12.5')).toBe(12.5);
    expect(parseDecimalFlexible('0.35')).toBe(0.35);
  });

  it('aceita virgula como decimal quando nao ha ponto', () => {
    expect(parseDecimalFlexible('12,5')).toBe(12.5);
    expect(parseDecimalFlexible('0,35')).toBe(0.35);
  });

  it('string vazia vira zero', () => {
    expect(parseDecimalFlexible('')).toBe(0);
    expect(parseDecimalFlexible('   ')).toBe(0);
  });
});
