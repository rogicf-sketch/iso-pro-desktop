import { describe, expect, it } from 'vitest';
import { parseAuthSessionUser, parseAuthUsersStorageList } from './authLocal.zod';

const storageRow = {
  id: 'u1',
  login: 'a',
  nome: 'N',
  senha: 's',
  ativo: true,
  perfilId: 'p1',
  perfilNome: 'P',
};

describe('parseAuthUsersStorageList', () => {
  it('aceita lista valida', () => {
    expect(parseAuthUsersStorageList([storageRow])).toEqual([storageRow]);
  });

  it('rejeita item sem senha', () => {
    expect(parseAuthUsersStorageList([{ ...storageRow, senha: undefined }])).toBeNull();
  });
});

describe('parseAuthSessionUser', () => {
  it('aceita sessao valida', () => {
    const session = {
      id: 'u1',
      login: 'a',
      nome: 'N',
      perfil: { id: 'p1', nome: 'P' },
      permissoes: [{ modulo: 'dashboard', acao: 'visualizar' as const, permitido: true }],
    };
    expect(parseAuthSessionUser(session)).toEqual(session);
  });

  it('rejeita acao invalida', () => {
    expect(
      parseAuthSessionUser({
        id: 'u1',
        login: 'a',
        nome: 'N',
        perfil: { id: 'p1', nome: 'P' },
        permissoes: [{ modulo: 'dashboard', acao: 'ler', permitido: true }],
      }),
    ).toBeNull();
  });
});
