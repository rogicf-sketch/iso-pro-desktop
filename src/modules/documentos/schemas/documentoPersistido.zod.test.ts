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

  it('rejeita quando nao e array', () => {
    expect(parseDocumentosPersistidos({})).toBeNull();
  });

  it('aceita id numerico e status desconhecido (normaliza)', () => {
    const raw = [
      {
        id: 42,
        numero: 'N1',
        revisao: 'A',
        descricao: 'D',
        responsavel: 'R',
        dataDocumento: '2026-01-01',
        status: 'fantasma',
        itens: [{ id: 1, codigoMaterial: 'M1', descricaoMaterial: 'X', unidade: 'UN', quantidadeProjeto: '3', quantidadeAtendida: null }],
      },
    ];
    const out = parseDocumentosPersistidos(raw);
    expect(out).not.toBeNull();
    expect(out![0].id).toBe('42');
    expect(out![0].status).toBe('pendente');
    expect(out![0].itens[0].quantidadeProjeto).toBe(3);
    expect(out![0].observacao).toBe('');
  });

  it('mantem documentos validos quando um da lista e irrecuperavel', () => {
    const raw = [
      {
        id: 'ok',
        numero: 'N1',
        revisao: 'A',
        descricao: 'D',
        responsavel: 'R',
        dataDocumento: '2026-01-01',
        status: 'pendente',
        observacao: '',
        itens: [],
      },
      null,
      { foo: 'bar' },
    ];
    const out = parseDocumentosPersistidos(raw);
    expect(out).toHaveLength(1);
    expect(out![0].id).toBe('ok');
  });
});
