import { describe, expect, it } from 'vitest';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import { encontrarRecebimentoPorNf, nfNormalizada } from './relatorioFotograficoRecebimento';

const mock: RecebimentoListItem[] = [
  {
    id: 'a',
    fornecedor: 'Fornecedor A',
    dataRecebimento: '2026-04-03',
    notaFiscal: 'NF-7778869',
    romaneio: 'R-1',
    modoRecebimento: 'direto',
    status: 'conferido',
    conferente: 'x',
    totalItens: 1,
    quantidadeRecebidaTotal: 1,
    quantidadeConferidaTotal: 1,
    conferenciaItensDivergentes: 0,
  },
];

describe('relatorioFotograficoRecebimento', () => {
  it('nfNormalizada remove prefixo NF', () => {
    expect(nfNormalizada('NF-7778869')).toBe('7778869');
    expect(nfNormalizada('7778869')).toBe('7778869');
  });

  it('encontra por numero sem prefixo', () => {
    expect(encontrarRecebimentoPorNf(mock, '7778869')?.id).toBe('a');
    expect(encontrarRecebimentoPorNf(mock, 'NF-7778869')?.id).toBe('a');
  });
});
