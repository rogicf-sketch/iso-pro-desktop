import { describe, expect, it } from 'vitest';
import type { Recebimento } from '../types/recebimento.types';
import { recebimentoCorrespondeBuscaInteligente } from './recebimentoBusca';

function rec(partial: Partial<Pick<Recebimento, 'notaFiscal' | 'romaneio' | 'fornecedor'>>): Pick<
  Recebimento,
  'notaFiscal' | 'romaneio' | 'fornecedor'
> {
  return {
    notaFiscal: partial.notaFiscal ?? '',
    romaneio: partial.romaneio ?? '',
    fornecedor: partial.fornecedor ?? '',
  };
}

describe('recebimentoCorrespondeBuscaInteligente', () => {
  it('busca vazia aceita qualquer registro', () => {
    expect(recebimentoCorrespondeBuscaInteligente(rec({ notaFiscal: 'X' }), '   ')).toBe(true);
  });

  it('includes direto em NF, romaneio e fornecedor', () => {
    expect(recebimentoCorrespondeBuscaInteligente(rec({ notaFiscal: 'NF-666777' }), '666777')).toBe(true);
    expect(recebimentoCorrespondeBuscaInteligente(rec({ romaneio: 'ROM-12' }), 'rom-12')).toBe(true);
    expect(recebimentoCorrespondeBuscaInteligente(rec({ fornecedor: 'ACME Ltda' }), 'acme')).toBe(true);
  });

  it('segmento da NF (ex.: trecho apos hifen)', () => {
    expect(recebimentoCorrespondeBuscaInteligente(rec({ notaFiscal: 'AQ-3-BT-232' }), '232')).toBe(true);
  });
});
