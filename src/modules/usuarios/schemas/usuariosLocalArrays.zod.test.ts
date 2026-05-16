import { describe, expect, it } from 'vitest';
import { parseUsuariosPerfisLocal, parseUsuariosSistemaLocal } from './usuariosLocalArrays.zod';

describe('parseUsuariosPerfisLocal', () => {
  it('aceita array de objetos com id', () => {
    expect(parseUsuariosPerfisLocal([{ id: 'p1', codigo: 'c', nome: 'N' }])).toEqual([
      { id: 'p1', codigo: 'c', nome: 'N' },
    ]);
  });

  it('rejeita perfil sem id', () => {
    expect(parseUsuariosPerfisLocal([{ codigo: 'x' }])).toBeNull();
  });
});

describe('parseUsuariosSistemaLocal', () => {
  it('aceita array com id e login', () => {
    expect(parseUsuariosSistemaLocal([{ id: 'u1', login: 'a', senha: 's' }])).toEqual([
      { id: 'u1', login: 'a', senha: 's' },
    ]);
  });

  it('rejeita utilizador sem login', () => {
    expect(parseUsuariosSistemaLocal([{ id: 'u1' }])).toBeNull();
  });
});
