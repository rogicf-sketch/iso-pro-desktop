import { describe, expect, it } from 'vitest';
import { paginarItensRelatorioImpressao } from './relatorioPaginacaoImpressao';

const optsRir = {
  primeiraPagina: 13,
  intermediaria: 12,
  ultimaComRodape: 8,
  splitForcadoAcimaDe: 8,
  splitForcadoAte: 12,
};

describe('paginarItensRelatorioImpressao', () => {
  it('9-12 itens forca 2 folhas equilibradas', () => {
    const f10 = paginarItensRelatorioImpressao(Array.from({ length: 10 }, (_, i) => i), optsRir);
    expect(f10).toHaveLength(2);
    expect(f10[0].itens).toHaveLength(5);
    expect(f10[1].itens).toHaveLength(5);
    expect(f10[1].incluirRodape).toBe(true);
  });

  it('21 itens mantem 13 + 8 na ultima folha', () => {
    const f21 = paginarItensRelatorioImpressao(Array.from({ length: 21 }, (_, i) => i), optsRir);
    expect(f21).toHaveLength(2);
    expect(f21[0].itens).toHaveLength(13);
    expect(f21[1].itens).toHaveLength(8);
    expect(f21[1].incluirRodape).toBe(true);
  });
});
