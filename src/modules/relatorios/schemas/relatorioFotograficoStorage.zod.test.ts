import { describe, expect, it } from 'vitest';
import {
  parseRelatorioFotograficoCatalogIds,
  parseRelatorioFotograficoSeqState,
} from './relatorioFotograficoStorage.zod';

describe('parseRelatorioFotograficoSeqState', () => {
  it('extrai year e n', () => {
    expect(parseRelatorioFotograficoSeqState({ year: '2026', n: 2 })).toEqual({ year: '2026', n: 2 });
  });

  it('retorna objeto vazio se invalido', () => {
    expect(parseRelatorioFotograficoSeqState(null)).toEqual({});
  });
});

describe('parseRelatorioFotograficoCatalogIds', () => {
  it('extrai ids', () => {
    expect(parseRelatorioFotograficoCatalogIds({ version: 1, ids: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('normaliza ids numericos legados para string', () => {
    expect(parseRelatorioFotograficoCatalogIds({ ids: [1, 2] })).toEqual(['1', '2']);
  });

  it('rejeita ids com tipos nao suportados', () => {
    expect(parseRelatorioFotograficoCatalogIds({ ids: [1, true] })).toEqual([]);
  });
});
