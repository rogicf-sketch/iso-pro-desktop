import { describe, expect, it } from 'vitest';
import { isPlainFormDirty } from './isPlainFormDirty';

describe('isPlainFormDirty', () => {
  it('retorna false quando igual', () => {
    expect(isPlainFormDirty({ a: 1 }, { a: 1 })).toBe(false);
  });

  it('retorna true quando diferente', () => {
    expect(isPlainFormDirty({ a: 1 }, { a: 2 })).toBe(true);
  });
});
