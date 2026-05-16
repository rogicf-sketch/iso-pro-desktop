/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executarIsoProAdminUserUpsert, isIsoProAdminUserEdgeConfigured } from './isoProAdminUser.service';

const { mockHasSupabaseConfig, mockGetSupabase, mockReadConfiguracoes } = vi.hoisted(() => ({
  mockHasSupabaseConfig: vi.fn(() => true),
  mockGetSupabase: vi.fn(),
  mockReadConfiguracoes: vi.fn(() => ({ isoProAdminUserSecret: '' })),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
}));

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: () => mockReadConfiguracoes(),
}));

describe('isoProAdminUser.service', () => {
  beforeEach(() => {
    mockHasSupabaseConfig.mockReturnValue(true);
    mockReadConfiguracoes.mockReturnValue({ isoProAdminUserSecret: '  x  ' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('isIsoProAdminUserEdgeConfigured e falso quando segredo vazio', () => {
    mockReadConfiguracoes.mockReturnValue({ isoProAdminUserSecret: '   ' });
    expect(isIsoProAdminUserEdgeConfigured()).toBe(false);
  });

  it('isIsoProAdminUserEdgeConfigured e verdadeiro com segredo nao vazio', () => {
    mockReadConfiguracoes.mockReturnValue({ isoProAdminUserSecret: 'abc' });
    expect(isIsoProAdminUserEdgeConfigured()).toBe(true);
  });

  it('executarIsoProAdminUserUpsert envia cabecalho e corpo', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, user: { id: 'u1', login: 'a' } },
      error: null,
    });
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

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
    expect(invoke).toHaveBeenCalledWith(
      'iso_pro_admin_user',
      expect.objectContaining({
        headers: { 'x-iso-pro-admin-user-secret': 's' },
        body: expect.objectContaining({
          mode: 'create',
          actorLogin: 'admin',
          tenantId: '00000000-0000-0000-0000-000000000001',
        }),
      }),
    );
  });
});
