import { describe, expect, it } from 'vitest';
import { hashPassword, isPasswordHash, preparePasswordForStorage, verifyPassword } from './passwordHash';

describe('passwordHash', () => {
  it('detecta hash bcrypt', async () => {
    const h = await hashPassword('segredo123');
    expect(isPasswordHash(h)).toBe(true);
    expect(isPasswordHash('admin')).toBe(false);
  });

  it('verifica hash bcrypt', async () => {
    const h = await hashPassword('minhaSenha');
    expect(await verifyPassword('minhaSenha', h)).toBe(true);
    expect(await verifyPassword('errada', h)).toBe(false);
  });

  it('aceita legado texto plano durante migração', async () => {
    expect(await verifyPassword('1234', '1234')).toBe(true);
    expect(await verifyPassword('1234', '5678')).toBe(false);
  });

  it('preparePasswordForStorage gera hash', async () => {
    const h = await preparePasswordForStorage('novaSenha');
    expect(h).toBeTruthy();
    expect(isPasswordHash(h!)).toBe(true);
  });
});
