import { describe, expect, it } from 'vitest';
import { parseDocumentosPersistidos } from './documentoPersistido.zod';

describe('parseDocumentosPersistidos', () => {
  it('aceita array valido minimo', () => {
    const raw = [
      {
        id: 'd1',
        numero: 'N1',
        revisao: 'A',
        descricao: 'D',
        responsavel: 'R',
        dataDocumento: '2026-01-01',
        status: 'pendente',
        observacao: '',
        itens: [
          {
            id: 'i1',
            codigoMaterial: 'M1',
            descricaoMaterial: 'X',
            unidade: 'UN',
            quantidadeProjeto: 1,
            quantidadeAtendida: 0,
          },
        ],
      },
    ];
    const out = parseDocumentosPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    expect(out![0].numero).toBe('N1');
  });

  it('rejeita status invalido', () => {
    const raw = [
      {
        id: 'd1',
        numero: 'N1',
        revisao: 'A',
        descricao: 'D',
        responsavel: 'R',
        dataDocumento: '2026-01-01',
        status: 'fantasma',
        observacao: '',
        itens: [],
      },
    ];
    expect(parseDocumentosPersistidos(raw)).toBeNull();
  });

  it('rejeita quando nao e array', () => {
    expect(parseDocumentosPersistidos({})).toBeNull();
  });
});
