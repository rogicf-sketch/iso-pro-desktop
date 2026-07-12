/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthSessionStorage, getAuthSessionStorageKey, getCurrentUser, login } from './auth.service';

vi.mock('../../../lib/isElectronApp', () => ({
  isElectronApp: vi.fn(() => false),
  isWebBrowserApp: vi.fn(() => true),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
  getSupabase: vi.fn(),
  resetSupabaseClient: vi.fn(),
  formatSupabaseConnectionError: vi.fn((msg: string) => msg),
}));

describe('auth.service / login (local)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    clearAuthSessionStorage();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('recusa credenciais vazias', async () => {
    await expect(login({ login: '', senha: '', permanecerLogado: false })).rejects.toThrow(
      'Informe login e senha.',
    );
    expect(getCurrentUser()).toBeNull();
  });

  it('recusa login ou senha invalidos sem Supabase', async () => {
    await expect(
      login({ login: 'inexistente', senha: 'errada', permanecerLogado: false }),
    ).rejects.toThrow('Login ou senha invalidos.');
    expect(getCurrentUser()).toBeNull();
  });

  it('autentica utilizador mock local em dev', async () => {
    const user = await login({ login: 'admin', senha: 'admin', permanecerLogado: false });
    expect(user.login).toBe('admin');
    expect(getCurrentUser()?.login).toBe('admin');
    expect(sessionStorage.getItem(getAuthSessionStorageKey())).toBeTruthy();
  });
});
