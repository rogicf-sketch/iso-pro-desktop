import { describe, expect, it } from 'vitest';
import { distribuirIndiceItensPorAltura } from './relatorioPaginacaoMedida';

const cfgBase = {
  pageHeightPx: 1000,
  firstPageOverheadPx: 320,
  nextPageOverheadPx: 320,
  footerPx: 280,
  tableHeaderPx: 28,
  folhaNumPx: 18,
  safetyPx: 10,
};

describe('distribuirIndiceItensPorAltura', () => {
  it('coloca todos os itens numa folha quando cabem com rodape', () => {
    const pages = distribuirIndiceItensPorAltura([40, 40, 40], cfgBase);
    expect(pages).toEqual([[0, 1, 2]]);
  });

  it('divide quando descricoes longas ocupam mais espaco', () => {
    const heights = [120, 120, 120, 120, 120, 120];
    const pages = distribuirIndiceItensPorAltura(heights, cfgBase);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('forca linha unica quando maior que a folha', () => {
    const pages = distribuirIndiceItensPorAltura([900, 40], cfgBase);
    expect(pages[0]).toEqual([0]);
    expect(pages.flat()).toEqual([0, 1]);
  });

  it('retorna folha vazia para zero itens', () => {
    expect(distribuirIndiceItensPorAltura([], cfgBase)).toEqual([[]]);
  });
});
