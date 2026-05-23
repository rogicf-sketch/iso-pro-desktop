import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Material } from '../types/material.types';
import {
  PERCENTUAL_ALERTA_ESTOQUE_LEGADO,
  backfillPercentualAlertaEstoqueJaExecutado,
  backfillPercentualAlertaEstoqueMateriais,
} from './backfillPercentualAlertaEstoqueMateriais';

function material(estoqueMinimo: number): Material {
  return {
    id: '1',
    codigo: 'A',
    codigoBarras: '',
    descricao: 'Teste',
    diametro: '',
    disciplina: 'Geral',
    unidade: 'UN',
    peso: 0,
    estoqueMinimo,
    saldoAtual: 0,
    ativo: true,
    observacao: '',
  };
}

describe('backfillPercentualAlertaEstoqueMateriais', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    } as Storage);
  });

  it('define 20% nos materiais com alerta zerado', () => {
    const { next, alterou } = backfillPercentualAlertaEstoqueMateriais([
      material(0),
      material(15),
    ]);
    expect(alterou).toBe(true);
    expect(next[0]?.estoqueMinimo).toBe(PERCENTUAL_ALERTA_ESTOQUE_LEGADO);
    expect(next[1]?.estoqueMinimo).toBe(15);
    expect(backfillPercentualAlertaEstoqueJaExecutado()).toBe(true);
  });

  it('nao altera novos cadastros com 0 apos a migracao', () => {
    backfillPercentualAlertaEstoqueMateriais([material(0)]);
    const { next, alterou } = backfillPercentualAlertaEstoqueMateriais([material(0)]);
    expect(alterou).toBe(false);
    expect(next[0]?.estoqueMinimo).toBe(0);
  });
});
