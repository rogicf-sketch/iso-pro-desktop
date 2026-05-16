/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { getAuthSessionStorageKey, getAuthUsersStorageKey } from '../../auth/services/auth.service';
import { executarLimpezaCadastrosLocal } from './limpezaCadastrosLocal.service';

const { mockLimparRelatorios, mockInvalidate } = vi.hoisted(() => ({
  mockLimparRelatorios: vi.fn(() =>
    Promise.resolve({ success: true as const, data: { removidosCatalogo: 0, chavesPayload: 0 } }),
  ),
  mockInvalidate: vi.fn(),
}));

vi.mock('../../relatorios/services/relatorioFotografico.service', () => ({
  limparTodosRelatoriosFotograficosLocais: () => mockLimparRelatorios(),
}));

vi.mock('../../../lib/isoProSnapshot', () => ({
  invalidateIsoProSnapshotCache: () => mockInvalidate(),
}));

vi.mock('../../auth/services/authAudit.service', () => ({
  appendAuthAuditEvent: vi.fn(),
  getAuthAuditStorageKey: () => 'iso-pro-desktop-auth-audit',
}));

describe('limpezaCadastrosLocal.service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('preserva configuracao, sessao e utilizadores; remove chaves de cadastro', async () => {
    const cfgKey = getScopedIsoProStorageKey('iso-pro-desktop-configuracoes-sistema');
    const perfisKey = getScopedIsoProStorageKey('iso-pro-desktop-perfis-acesso');
    localStorage.setItem(cfgKey, '{"cliente":"X"}');
    localStorage.setItem(
      getAuthSessionStorageKey(),
      JSON.stringify({
        id: 'u1',
        login: 'admin',
        nome: 'Admin',
        perfil: { id: 'p1', nome: 'Perfil' },
        permissoes: [{ modulo: 'configuracoes', acao: 'administrar', permitido: true }],
      }),
    );
    localStorage.setItem(getAuthUsersStorageKey(), '[]');
    localStorage.setItem(perfisKey, '[]');
    localStorage.setItem(getScopedIsoProStorageKey('iso-pro-desktop-materiais'), '[]');
    localStorage.setItem(getScopedIsoProStorageKey('iso-pro-desktop-documentos'), '[]');

    const r = await executarLimpezaCadastrosLocal();
    expect(r.success).toBe(true);

    expect(localStorage.getItem(cfgKey)).toBe('{"cliente":"X"}');
    expect(localStorage.getItem(getAuthSessionStorageKey())).toContain('admin');
    expect(localStorage.getItem(getAuthUsersStorageKey())).toBe('[]');
    expect(localStorage.getItem(perfisKey)).toBe('[]');
    expect(localStorage.getItem(getScopedIsoProStorageKey('iso-pro-desktop-materiais'))).toBeNull();
    expect(localStorage.getItem(getScopedIsoProStorageKey('iso-pro-desktop-documentos'))).toBeNull();
    expect(mockLimparRelatorios).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
  });
});
