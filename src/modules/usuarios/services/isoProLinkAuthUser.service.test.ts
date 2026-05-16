/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT = '00000000-0000-0000-0000-000000000001';
const mockHasSupabaseConfig = vi.fn();
const mockGetSupabase = vi.fn();
const mockGetActiveTenantId = vi.fn(() => TENANT);
const mockGetCurrentUser = vi.fn(() => ({ login: 'admin.test' }));
const mockAppendAuthAuditEvent = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: () => mockGetActiveTenantId(),
}));

vi.mock('../../auth/services/auth.service', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock('../../auth/services/authAudit.service', () => ({
  appendAuthAuditEvent: (...args: unknown[]) => mockAppendAuthAuditEvent(...args),
}));

import { executarIsoProLinkAuthUser } from './isoProLinkAuthUser.service';

describe('executarIsoProLinkAuthUser', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    mockHasSupabaseConfig.mockReturnValue(true);
    mockGetSupabase.mockReturnValue({
      functions: { invoke },
    });
    invoke.mockReset();
    mockAppendAuthAuditEvent.mockReset();
    mockGetActiveTenantId.mockReturnValue(TENANT);
  });

  it('falha quando Supabase nao esta configurado', async () => {
    mockHasSupabaseConfig.mockReturnValue(false);
    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'u1',
      authUserId: null,
      secret: 's',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Supabase nao configurado/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falha quando cliente Supabase e null', async () => {
    mockGetSupabase.mockReturnValue(null);
    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'u1',
      authUserId: null,
      secret: 's',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/indisponivel/i);
  });

  it('falha quando segredo vazio', async () => {
    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'usr-id',
      authUserId: '550e8400-e29b-41d4-a716-446655440000',
      secret: '   ',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Configuracoes/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('falha quando usuarioId vazio apos trim', async () => {
    const r = await executarIsoProLinkAuthUser({
      usuarioId: '  ',
      authUserId: null,
      secret: 'abc',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Usuario invalido/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('propaga mensagem JSON do contexto em erro de invoke', async () => {
    class FnErr extends Error {
      context?: Response;
      constructor() {
        super('Edge Function returned a non-2xx status code');
        this.context = {
          json: async () => ({ ok: false, message: 'Usuario nao encontrado na base.' }),
        } as Response;
      }
    }
    invoke.mockResolvedValue({ data: null, error: new FnErr() });
    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'uuid-row',
      authUserId: null,
      secret: 'sek',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('Usuario nao encontrado na base.');
  });

  it('falha quando corpo retorna ok false', async () => {
    invoke.mockResolvedValue({
      data: { ok: false, message: 'Nao autorizado.' },
      error: null,
    });
    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'row-1',
      authUserId: null,
      secret: 'x',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('Nao autorizado.');
  });

  it('falha quando corpo sem ok true', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'row-1',
      authUserId: null,
      secret: 'x',
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/inesperada/i);
  });

  it('sucesso ao ligar: envia tenant activo, cabecalho secreto e regista auditoria', async () => {
    const authUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    invoke.mockResolvedValue({
      data: { ok: true, message: 'auth_user_id definido.' },
      error: null,
    });

    const r = await executarIsoProLinkAuthUser({
      usuarioId: '  usuario-row-id  ',
      authUserId: authUuid,
      secret: '  mysecret  ',
      usuarioLogin: ' joao ',
    });

    expect(r.success).toBe(true);
    expect(r.data?.message).toBe('auth_user_id definido.');
    expect(invoke).toHaveBeenCalledWith(
      'iso_pro_link_auth_user',
      expect.objectContaining({
        body: {
          usuarioId: 'usuario-row-id',
          tenantId: TENANT,
          authUserId: authUuid,
        },
        headers: { 'x-iso-pro-link-secret': 'mysecret' },
      }),
    );
    expect(mockAppendAuthAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user_saved',
        actorLogin: 'admin.test',
        targetLogin: 'joao',
        detail: expect.stringContaining('definida'),
      }),
    );
  });

  it('sucesso ao remover ligacao: authUserId null e detalhe de remocao', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, message: 'auth_user_id removido.' },
      error: null,
    });

    const r = await executarIsoProLinkAuthUser({
      usuarioId: 'u99',
      authUserId: null,
      secret: 's',
    });

    expect(r.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      'iso_pro_link_auth_user',
      expect.objectContaining({
        body: expect.objectContaining({
          usuarioId: 'u99',
          tenantId: TENANT,
          authUserId: null,
        }),
      }),
    );
    expect(mockAppendAuthAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining('removida'),
      }),
    );
  });
});
