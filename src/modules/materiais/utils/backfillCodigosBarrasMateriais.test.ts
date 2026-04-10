import { describe, expect, it } from 'vitest';
import type { Material } from '../types/material.types';
import { backfillCodigosBarrasMateriais } from './backfillCodigosBarrasMateriais';

function mat(p: Partial<Material> & Pick<Material, 'id' | 'codigo'>): Material {
  return {
    descricao: 'D',
    diametro: '',
    disciplina: 'X',
    unidade: 'UN',
    peso: 0,
    estoqueMinimo: 0,
    saldoAtual: 0,
    ativo: true,
    observacao: '',
    codigoBarras: '',
    ...p,
  };
}

describe('backfillCodigosBarrasMateriais', () => {
  it('nao altera quando todos ja tem codigo de barras', () => {
    const items: Material[] = [
      mat({ id: '1', codigo: 'A', codigoBarras: '7899999000015' }),
    ];
    const { next, alterou } = backfillCodigosBarrasMateriais(items);
    expect(alterou).toBe(false);
    expect(next[0]?.codigoBarras).toBe('7899999000015');
  });

  it('preenche vazios em ordem de codigo', () => {
    const items: Material[] = [
      mat({ id: 'b', codigo: 'B-2', codigoBarras: '' }),
      mat({ id: 'a', codigo: 'A-1', codigoBarras: '' }),
    ];
    const { next, alterou } = backfillCodigosBarrasMateriais(items);
    expect(alterou).toBe(true);
    const byCod = [...next].sort((x, y) => x.codigo.localeCompare(y.codigo));
    expect(byCod[0]?.codigo).toBe('A-1');
    expect(byCod[0]?.codigoBarras).toBe('7899999000015');
    expect(byCod[1]?.codigoBarras).toBe('7899999000022');
  });
});
