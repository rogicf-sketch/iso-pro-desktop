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

  it('nao confunde duas NFs so porque ambas comecam com NF-', () => {
    expect(recebimentoCorrespondeBuscaInteligente(rec({ notaFiscal: 'NF-692144' }), 'NF-742197')).toBe(false);
    expect(recebimentoCorrespondeBuscaInteligente(rec({ notaFiscal: 'NF-692144' }), 'nf-742197')).toBe(false);
  });

  it('ainda encontra a NF exata digitada', () => {
    expect(recebimentoCorrespondeBuscaInteligente(rec({ notaFiscal: 'NF-742197' }), 'NF-742197')).toBe(true);
  });
});
