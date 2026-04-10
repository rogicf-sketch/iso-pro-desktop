import { describe, expect, it } from 'vitest';
import type { DocumentoFormData } from '../types/documento.types';
import { validateDocumento } from './documento.schema';

const base: DocumentoFormData = {
  numero: 'DOC-1',
  revisao: 'A',
  descricao: 'Teste',
  responsavel: 'R',
  dataDocumento: '2026-01-01',
  observacao: '',
  itens: [
    {
      id: 'i1',
      codigoMaterial: 'M1',
      descricaoMaterial: 'Mat 1',
      unidade: 'UN',
      quantidadeProjeto: 1,
      quantidadeAtendida: 0,
    },
  ],
};

describe('validateDocumento', () => {
  it('retorna null quando dados sao validos', () => {
    expect(validateDocumento(base)).toBeNull();
  });

  it('exige numero', () => {
    expect(validateDocumento({ ...base, numero: ' ' })).toBe('Informe o numero do documento.');
  });

  it('exige revisao', () => {
    expect(validateDocumento({ ...base, revisao: '' })).toBe('Informe a revisao.');
  });

  it('exige data', () => {
    expect(validateDocumento({ ...base, dataDocumento: '  ' })).toBe('Informe a data do documento.');
  });

  it('exige ao menos um item', () => {
    expect(validateDocumento({ ...base, itens: [] })).toBe('Adicione ao menos um item ao documento.');
  });

  it('rejeita item sem codigo ou quantidade invalida', () => {
    expect(validateDocumento({ ...base, itens: [{ ...base.itens[0], codigoMaterial: '' }] })).toBe(
      'Todos os itens precisam ter codigo, descricao e quantidade valida.',
    );
    expect(
      validateDocumento({ ...base, itens: [{ ...base.itens[0], quantidadeProjeto: 0 }] }),
    ).toBe('Todos os itens precisam ter codigo, descricao e quantidade valida.');
  });

  it('rejeita codigo de material duplicado', () => {
    const dup: DocumentoFormData = {
      ...base,
      itens: [
        { ...base.itens[0], id: 'a', codigoMaterial: 'SAME' },
        {
          id: 'b',
          codigoMaterial: 'same',
          descricaoMaterial: 'X',
          unidade: 'UN',
          quantidadeProjeto: 1,
          quantidadeAtendida: 0,
        },
      ],
    };
    expect(validateDocumento(dup)).toMatch(/Nao e permitido repetir o material/);
  });
});
