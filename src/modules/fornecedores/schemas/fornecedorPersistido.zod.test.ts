import { describe, expect, it } from 'vitest';
import { parseFornecedoresPersistidos } from './fornecedorPersistido.zod';

describe('parseFornecedoresPersistidos', () => {
  it('aceita fornecedor valido', () => {
    const raw = [
      {
        id: 'f1',
        nome: 'N',
        cnpj: '1',
        telefone: 't',
        email: 'e',
        endereco: 'x',
        ativo: true,
      },
    ];
    expect(parseFornecedoresPersistidos(raw)).not.toBeNull();
  });

  it('rejeita ativo nao booleano', () => {
    const raw = [
      {
        id: 'f1',
        nome: 'N',
        cnpj: '1',
        telefone: 't',
        email: 'e',
        endereco: 'x',
        ativo: 'sim',
      },
    ];
    expect(parseFornecedoresPersistidos(raw)).toBeNull();
  });

  it('rejeita quando nao e array', () => {
    expect(parseFornecedoresPersistidos({})).toBeNull();
  });
});
