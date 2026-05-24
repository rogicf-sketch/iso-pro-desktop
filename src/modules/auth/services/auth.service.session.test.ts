/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import {
  AUTH_SESSION_LAST_ACTIVITY_KEY_BASE,
  AUTH_SESSION_MAX_IDLE_MS,
  clearAuthSessionStorage,
  getActiveAuthSessionStorage,
  getAuthSessionStorageKey,
  getCurrentUser,
  persistAuthSession,
  readRememberLoginDefault,
  readRememberLoginPreference,
  touchAuthSessionActivity,
} from './auth.service';
import type { AuthUser } from '../types/auth.types';

vi.mock('../../../lib/isElectronApp', () => ({
  isElectronApp: vi.fn(() => false),
  isWebBrowserApp: vi.fn(() => true),
}));

const sampleUser: AuthUser = {
  id: 'u1',
  login: 'teste',
  nome: 'Teste',
  perfil: { id: 'p1', nome: 'Perfil' },
  permissoes: [{ modulo: 'dashboard', acao: 'visualizar', permitido: true }],
};

function activityKey() {
  return getScopedIsoProStorageKey(AUTH_SESSION_LAST_ACTIVITY_KEY_BASE);
}

describe('sessao login — permanecer logado', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    clearAuthSessionStorage();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('sem marcar usa sessionStorage', () => {
    persistAuthSession(sampleUser, false);
    expect(sessionStorage.getItem(getAuthSessionStorageKey())).toBeTruthy();
    expect(localStorage.getItem(getAuthSessionStorageKey())).toBeNull();
    expect(getActiveAuthSessionStorage()).toBe(sessionStorage);
    expect(getCurrentUser()?.login).toBe('teste');
  });

  it('marcado usa localStorage', () => {
    persistAuthSession(sampleUser, true);
    expect(localStorage.getItem(getAuthSessionStorageKey())).toBeTruthy();
    expect(sessionStorage.getItem(getAuthSessionStorageKey())).toBeNull();
    expect(getActiveAuthSessionStorage()).toBe(localStorage);
  });

  it('readRememberLoginPreference reflete ultima escolha', () => {
    persistAuthSession(sampleUser, true);
    expect(readRememberLoginPreference()).toBe(true);
    persistAuthSession(sampleUser, false);
    expect(readRememberLoginPreference()).toBe(false);
  });

  it('readRememberLoginDefault false em web (mock)', () => {
    expect(readRememberLoginDefault()).toBe(false);
    expect(readRememberLoginPreference()).toBe(false);
  });

  it('expira apos 8h sem actividade mesmo com permanecer logado', () => {
    persistAuthSession(sampleUser, true);
    const backend = getActiveAuthSessionStorage()!;
    backend.setItem(activityKey(), String(Date.now() - AUTH_SESSION_MAX_IDLE_MS - 1));
    expect(getCurrentUser()).toBeNull();
    expect(localStorage.getItem(getAuthSessionStorageKey())).toBeNull();
  });

  it('touchAuthSessionActivity renova a janela de inatividade', () => {
    persistAuthSession(sampleUser, true);
    const backend = getActiveAuthSessionStorage()!;
    backend.setItem(activityKey(), String(Date.now() - AUTH_SESSION_MAX_IDLE_MS - 1));
    touchAuthSessionActivity();
    expect(getCurrentUser()?.login).toBe('teste');
  });
});
