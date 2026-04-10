import { describe, expect, it } from 'vitest';
import { formatBytesPtBr } from './storageHealth';

describe('storageHealth / formatBytesPtBr', () => {
  it('formata bytes em pt-BR', () => {
    expect(formatBytesPtBr(0)).toMatch(/0/);
    expect(formatBytesPtBr(1024)).toMatch(/KB/);
    expect(formatBytesPtBr(1024 * 1024)).toMatch(/MB/);
  });
});
