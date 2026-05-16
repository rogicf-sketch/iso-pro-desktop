import { describe, expect, it } from 'vitest';
import { parseColaboradoresPersistidosRaw } from './colaboradorPersistido.zod';

describe('parseColaboradoresPersistidosRaw', () => {
  it('aceita array com id e nome (campos extra preservados)', () => {
    const raw = [{ id: 'c1', nome: 'N', matricula: '1', tipo: 'interno' }];
    const out = parseColaboradoresPersistidosRaw(raw);
    expect(out).not.toBeNull();
    expect(out![0].nome).toBe('N');
  });

  it('rejeita quando falta nome', () => {
    expect(parseColaboradoresPersistidosRaw([{ id: 'c1' }])).toBeNull();
  });

  it('rejeita quando nao e array', () => {
    expect(parseColaboradoresPersistidosRaw({})).toBeNull();
  });
});
