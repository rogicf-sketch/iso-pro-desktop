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
import {
  authenticateIsoProPreferJwt,
  isIsoProJwtSessionActive,
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
      auth: { signInWithPassword, mfa: { getAuthenticatorAssuranceLevel, listFactors: vi.fn() } },
    } as never);

    const outcome = await authenticateIsoProPreferJwt('admin', 'secret');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.authPath).toBe('jwt');
      expect(outcome.jwt).toEqual({ kind: 'ok' });
    }
    expect(mockedAutenticar).not.toHaveBeenCalled();
  });

  it('authenticateIsoProPreferJwt rpc_only quando jwtReady false com user', async () => {
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
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.authPath).toBe('rpc_only');
      expect(outcome.user.login).toBe('admin');
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
});
