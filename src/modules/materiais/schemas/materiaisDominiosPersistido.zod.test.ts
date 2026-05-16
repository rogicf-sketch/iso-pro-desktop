import { describe, expect, it } from 'vitest';
import { parseMateriaisDominiosPersistido } from './materiaisDominiosPersistido.zod';

describe('parseMateriaisDominiosPersistido', () => {
  it('aceita objeto com arrays', () => {
    expect(parseMateriaisDominiosPersistido({ disciplinas: ['A'], unidades: ['UN'] })).toEqual({
      disciplinas: ['A'],
      unidades: ['UN'],
    });
  });

  it('rejeita topo nao-objeto', () => {
    expect(parseMateriaisDominiosPersistido([])).toBeNull();
  });
});
