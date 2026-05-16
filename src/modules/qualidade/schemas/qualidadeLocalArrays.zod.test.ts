import { describe, expect, it } from 'vitest';
import { parseQualidadeRegistrosLocal } from './qualidadeLocalArrays.zod';

describe('parseQualidadeRegistrosLocal', () => {
  it('aceita array de objetos com id', () => {
    expect(parseQualidadeRegistrosLocal([{ id: 'a' }, { id: 2 }])).toEqual([{ id: 'a' }, { id: 2 }]);
  });

  it('aceita array vazio', () => {
    expect(parseQualidadeRegistrosLocal([])).toEqual([]);
  });

  it('rejeita item sem id', () => {
    expect(parseQualidadeRegistrosLocal([{ codigo: 'x' }])).toBeNull();
  });

  it('rejeita nao-array', () => {
    expect(parseQualidadeRegistrosLocal({})).toBeNull();
  });
});
