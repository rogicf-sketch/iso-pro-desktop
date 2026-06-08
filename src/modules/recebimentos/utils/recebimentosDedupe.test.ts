import { describe, expect, it } from 'vitest';
import type { Recebimento } from '../types/recebimento.types';
import { dedupeRecebimentosPorChaveNegocio } from './recebimentosDedupe';

function rec(partial: Partial<Recebimento> & Pick<Recebimento, 'id'>): Recebimento {
  return {
    fornecedor: 'Siemens Ltda',
    dataRecebimento: '2026-06-07',
    notaFiscal: 'NF-0104161',
    romaneio: 'ROM-RAZN008',
    conferente: 'Carlos',
    modoRecebimento: 'aguardando_conferencia',
    status: 'aguardando_conferencia',
    observacoes: '',
    itens: [
      {
        id: 'i1',
        codigoMaterial: 'M1',
        descricaoMaterial: 'Mat',
        unidade: 'PÇ',
        disciplina: 'INS',
        localizacao: 'CONTAINER INST.',
        quantidadeRecebida: 1,
        quantidadeConferida: 0,
        pesoUnitario: 0,
        pesoTotal: 0,
      },
    ],
    ...partial,
  };
}

describe('dedupeRecebimentosPorChaveNegocio', () => {
  it('mantém conferido e localização atual quando há duplicata da mesma NF', () => {
    const legado = rec({
      id: 'old-1',
      status: 'aguardando_conferencia',
      itens: [
        {
          id: 'i-old',
          codigoMaterial: 'M1',
          descricaoMaterial: 'Mat',
          unidade: 'PÇ',
          disciplina: 'INS',
          localizacao: 'CONTAINER INST.',
          quantidadeRecebida: 1,
          quantidadeConferida: 0,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
      ],
    });
    const atual = rec({
      id: 'new-1',
      status: 'conferido',
      dataConferencia: '2026-06-08T01:00:00.000Z',
      itens: [
        {
          id: 'i-new',
          codigoMaterial: 'M1',
          descricaoMaterial: 'Mat',
          unidade: 'PÇ',
          disciplina: 'INS',
          localizacao: 'CONT.REFRI.79',
          quantidadeRecebida: 1,
          quantidadeConferida: 1,
          pesoUnitario: 0,
          pesoTotal: 0,
        },
      ],
    });

    const out = dedupeRecebimentosPorChaveNegocio([legado, atual]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('new-1');
    expect(out[0]?.status).toBe('conferido');
    expect(out[0]?.itens[0]?.localizacao).toBe('CONT.REFRI.79');
  });
});
