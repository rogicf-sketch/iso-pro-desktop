import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
  resetSupabaseClient: vi.fn(),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: vi.fn(() => 'tenant-1'),
}));

import { getSupabase } from './supabase';
import { isIsoProJwtSessionActive, resolverAuthEmailSessao } from './isoProJwtSession';

const mockedGetSupabase = vi.mocked(getSupabase);

describe('isoProJwtSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });
  });

  it('resolverAuthEmailSessao mapeia email quando RPC ok', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: { ok: true, jwtReady: true, email: 'admin@empresa.com', authUserId: 'auth-1' },
        error: null,
      })),
    } as never);

    const r = await resolverAuthEmailSessao('admin', 'secret');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.email).toBe('admin@empresa.com');
    }
  });

  it('isIsoProJwtSessionActive false por omissao', () => {
    expect(isIsoProJwtSessionActive()).toBe(false);
  });

  it('bootstrap JWT activo por omissao (sem opt-out)', async () => {
    const signInWithPassword = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    }));
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: { ok: true, jwtReady: true, email: 'admin@isopro.local', authUserId: 'auth-1' },
        error: null,
      })),
      auth: { signInWithPassword, mfa: { getAuthenticatorAssuranceLevel, listFactors: vi.fn() } },
    } as never);

    const { tryBootstrapJwtSessionAfterLogin } = await import('./isoProJwtSession');
    const outcome = await tryBootstrapJwtSessionAfterLogin('admin', 'secret');
    expect(outcome).toEqual({ kind: 'ok' });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@isopro.local',
      password: 'secret',
    });
  });

  it('devolve mfa_required quando nextLevel aal2', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: { ok: true, jwtReady: true, email: 'admin@isopro.local', authUserId: 'auth-1' },
        error: null,
      })),
      auth: {
        signInWithPassword: vi.fn(async () => ({ data: { session: {} }, error: null })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: 'aal1', nextLevel: 'aal2' },
            error: null,
          })),
          listFactors: vi.fn(async () => ({
            data: { totp: [{ id: 'factor-mfa', status: 'verified' }], phone: [] },
            error: null,
          })),
        },
      },
    } as never);

    const { tryBootstrapJwtSessionAfterLogin } = await import('./isoProJwtSession');
    const outcome = await tryBootstrapJwtSessionAfterLogin('admin', 'secret');
    expect(outcome).toEqual({ kind: 'mfa_required', factorId: 'factor-mfa' });
  });
});
