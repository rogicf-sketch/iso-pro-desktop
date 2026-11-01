import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
  resetSupabaseClient: vi.fn(),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('./isoProAuthRpc', () => ({
  autenticarUsuarioIsoProRpc: vi.fn(),
  mapIsoProAuthRpcUser: (u: unknown) => u,
}));

import { getSupabase } from './supabase';
import { autenticarUsuarioIsoProRpc } from './isoProAuthRpc';
import { bumpIsoProJwtEpoch, isoProJwtEpoch } from './isoProJwtEpoch';
import {
  authenticateIsoProPreferJwt,
  clearIsoProJwtSession,
  isIsoProJwtSessionActive,
  isoProUserRequiresMfaEnroll,
  resolverAuthEmailSessao,
} from './isoProJwtSession';

const mockedGetSupabase = vi.mocked(getSupabase);
const mockedAutenticar = vi.mocked(autenticarUsuarioIsoProRpc);

const sampleUser = {
  id: 'u1',
  login: 'admin',
  nome: 'Admin',
  perfil: { id: 'p1', nome: 'Admin' },
  permissoes: [],
};

function accessTokenWithTenant(tenantId: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ tenant_id: tenantId, role: 'authenticated' }));
  return `${header}.${payload}.sig`;
}

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
        data: {
          ok: true,
          jwtReady: true,
          email: 'admin@empresa.com',
          authUserId: 'auth-1',
          user: sampleUser,
        },
        error: null,
      })),
    } as never);

    const r = await resolverAuthEmailSessao('admin', 'secret');
    expect(r.ok).toBe(true);
    if (r.ok && r.jwtReady) {
      expect(r.email).toBe('admin@empresa.com');
      expect(r.user?.id).toBe('u1');
    }
  });

  it('isIsoProJwtSessionActive false por omissao', () => {
    expect(isIsoProJwtSessionActive()).toBe(false);
  });

  it('authenticateIsoProPreferJwt usa path jwt quando signIn ok', async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { session: { access_token: accessTokenWithTenant('tenant-1') } },
      error: null,
    }));
    const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    }));
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          jwtReady: true,
          email: 'admin@isopro.local',
          authUserId: 'auth-1',
          user: sampleUser,
        },
        error: null,
      })),
      auth: {
        signInWithPassword,
        mfa: {
          getAuthenticatorAssuranceLevel,
          listFactors: vi.fn(async () => ({
            data: { totp: [{ id: 'factor-ok', status: 'verified' }], phone: [] },
            error: null,
          })),
        },
      },
    } as never);

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.authPath).toBe('jwt');
      expect(outcome.jwt).toEqual({ kind: 'ok' });
    }
    expect(mockedAutenticar).not.toHaveBeenCalled();
  });

  it('authenticateIsoProPreferJwt recusa jwtReady false (fail-closed)', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          jwtReady: false,
          user: sampleUser,
          error: 'Utilizador sem ligacao Supabase Auth (auth_user_id).',
        },
        error: null,
      })),
    } as never);

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/sem ligacao Supabase Auth/i);
    }
    expect(mockedAutenticar).not.toHaveBeenCalled();
  });

  it('authenticateIsoProPreferJwt recusa quando JWT falha (sem rpc_fallback)', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          jwtReady: true,
          email: 'admin@isopro.local',
          authUserId: 'auth-1',
          user: sampleUser,
        },
        error: null,
      })),
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'Invalid login credentials' },
        })),
        signOut: vi.fn(async () => ({ error: null })),
        mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn() },
      },
    } as never);

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/JWT falhou|Invalid login/i);
    }
  });

  it('devolve mfa_required quando nextLevel aal2', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          jwtReady: true,
          email: 'admin@isopro.local',
          authUserId: 'auth-1',
          user: sampleUser,
        },
        error: null,
      })),
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: { access_token: accessTokenWithTenant('tenant-1') } },
          error: null,
        })),
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

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.authPath).toBe('jwt');
      expect(outcome.jwt).toEqual({ kind: 'mfa_required', factorId: 'factor-mfa' });
    }
  });

  it('devolve mfa_enroll_required quando admin sem TOTP verificado', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          jwtReady: true,
          email: 'admin@isopro.local',
          authUserId: 'auth-1',
          user: sampleUser,
        },
        error: null,
      })),
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: { access_token: accessTokenWithTenant('tenant-1') } },
          error: null,
        })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: 'aal1', nextLevel: 'aal1' },
            error: null,
          })),
          listFactors: vi.fn(async () => ({
            data: { totp: [], phone: [] },
            error: null,
          })),
        },
      },
    } as never);

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.jwt).toEqual({ kind: 'mfa_enroll_required' });
    }
  });
});

describe('isoProUserRequiresMfaEnroll', () => {
  it('nao exige MFA para Operacao com visualizar/editar em configuracoes', () => {
    expect(
      isoProUserRequiresMfaEnroll({
        id: 'u-flavio',
        login: 'flavio',
        nome: 'Flavio',
        perfil: { id: 'op', nome: 'Operacao' },
        permissoes: [
          { modulo: 'configuracoes', acao: 'visualizar', permitido: true },
          { modulo: 'configuracoes', acao: 'editar', permitido: true },
          { modulo: 'usuarios', acao: 'visualizar', permitido: true },
        ],
      }),
    ).toBe(false);
  });

  it('exige MFA para quem administra usuarios', () => {
    expect(
      isoProUserRequiresMfaEnroll({
        id: 'u-ti',
        login: 'ti',
        nome: 'TI',
        perfil: { id: 'p', nome: 'Operacao' },
        permissoes: [{ modulo: 'usuarios', acao: 'administrar', permitido: true }],
      }),
    ).toBe(true);
  });
});

describe('detectMfaEnrollRequired fail-closed (via authenticate)', () => {
  it('pede enroll quando listFactors falha para admin', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: {
          ok: true,
          jwtReady: true,
          email: 'admin@isopro.local',
          authUserId: 'auth-1',
          user: sampleUser,
        },
        error: null,
      })),
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: { access_token: accessTokenWithTenant('tenant-1') } },
          error: null,
        })),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: 'aal1', nextLevel: 'aal1' },
            error: null,
          })),
          listFactors: vi.fn(async () => ({
            data: null,
            error: { message: 'temporary factor list failure' },
          })),
        },
      },
    } as never);

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.jwt).toEqual({ kind: 'mfa_enroll_required' });
    }
  });

  it('clear da troca de empresa nao apaga o login que comecou depois', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    mockedGetSupabase.mockReturnValue({ auth: { signOut } } as never);
    const scheduled = isoProJwtEpoch();
    const stale = clearIsoProJwtSession(scheduled);
    bumpIsoProJwtEpoch();
    const current = clearIsoProJwtSession();
    await Promise.all([stale, current]);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
