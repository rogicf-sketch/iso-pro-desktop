/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executarIsoProAdminUserUpsert,
  isIsoProAdminUserEdgeConfigured,
  isIsoProAdminUserEdgeUnreachableError,
} from './isoProAdminUser.service';

const { mockHasSupabaseConfig, mockGetSupabase, mockReadConfiguracoes, mockResolveCreds } = vi.hoisted(() => ({
  mockHasSupabaseConfig: vi.fn(() => true),
  mockGetSupabase: vi.fn(),
  mockReadConfiguracoes: vi.fn(() => ({ isoProAdminUserSecret: '' })),
  mockResolveCreds: vi.fn(() => ({
    url: 'https://example.supabase.co',
    key: 'anon-key',
    urlFrom: 'vite-env' as const,
    keyFrom: 'vite-env' as const,
  })),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
  resolveSupabaseCredentials: () => mockResolveCreds(),
}));

vi.mock('../../../lib/supabaseDesktopFetch', () => ({
  canUseDesktopSupabaseFetch: () => false,
  createDesktopSupabaseFetch: () => fetch,
}));

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: () => mockReadConfiguracoes(),
}));

describe('isoProAdminUser.service', () => {
  beforeEach(() => {
    mockHasSupabaseConfig.mockReturnValue(true);
    mockReadConfiguracoes.mockReturnValue({ isoProAdminUserSecret: '  x  ' });
    mockGetSupabase.mockReturnValue({
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('isIsoProAdminUserEdgeConfigured e falso quando segredo vazio', () => {
    mockReadConfiguracoes.mockReturnValue({ isoProAdminUserSecret: '   ' });
    expect(isIsoProAdminUserEdgeConfigured()).toBe(false);
  });

  it('isIsoProAdminUserEdgeConfigured e verdadeiro com segredo nao vazio', () => {
    mockReadConfiguracoes.mockReturnValue({ isoProAdminUserSecret: 'abc' });
    expect(isIsoProAdminUserEdgeConfigured()).toBe(true);
  });

  it('detecta erro de Edge inacessivel', () => {
    expect(isIsoProAdminUserEdgeUnreachableError('Failed to send a request to the Edge Function')).toBe(true);
    expect(isIsoProAdminUserEdgeUnreachableError('Segredo incorrecto')).toBe(false);
  });

  it('executarIsoProAdminUserUpsert faz POST com segredo no corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, user: { id: 'u1', login: 'a' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await executarIsoProAdminUserUpsert({
      secret: 's',
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorLogin: 'admin',
      actorSenha: 'pw',
      mode: 'create',
      user: {
        login: 'novo',
        nome: 'N',
        senha: '1234',
        perfil_id: 'p1',
        ativo: true,
        colaborador_id: null,
      },
      permissoes: [{ modulo: 'dashboard', acao: 'visualizar', permitido: true }],
    });

    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/iso_pro_admin_user',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"adminUserSecret":"s"'),
      }),
    );
  });
});
