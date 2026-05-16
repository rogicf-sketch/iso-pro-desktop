import { describe, expect, it } from 'vitest';
import { parseRecebimentosPersistidos } from './recebimentoPersistido.zod';

describe('parseRecebimentosPersistidos', () => {
  it('aceita array valido minimo', () => {
    const raw = [
      {
        id: 'r1',
        fornecedor: 'F',
        dataRecebimento: '2026-01-01',
        notaFiscal: '1',
        romaneio: '',
        conferente: 'C',
        modoRecebimento: 'direto',
        status: 'conferido',
        observacoes: '',
        itens: [
          {
            id: 'i1',
            codigoMaterial: 'M1',
            descricaoMaterial: 'D',
            unidade: 'UN',
            disciplina: 'X',
            localizacao: 'L',
            quantidadeRecebida: 1,
            quantidadeConferida: 1,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      },
    ];
    const out = parseRecebimentosPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    expect(out![0].id).toBe('r1');
  });

  it('rejeita quando status e invalido', () => {
    const raw = [
      {
        id: 'r1',
        fornecedor: 'F',
        dataRecebimento: '2026-01-01',
        notaFiscal: '1',
        romaneio: '',
        conferente: 'C',
        modoRecebimento: 'direto',
        status: 'inventado',
        observacoes: '',
        itens: [],
      },
    ];
    expect(parseRecebimentosPersistidos(raw)).toBeNull();
  });

  it('rejeita quando nao e array', () => {
    expect(parseRecebimentosPersistidos({})).toBeNull();
    expect(parseRecebimentosPersistidos(null)).toBeNull();
  });
});
