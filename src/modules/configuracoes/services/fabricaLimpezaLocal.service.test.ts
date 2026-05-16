/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { getAuthAuditStorageKey } from '../../auth/services/authAudit.service';
import { getAuthSessionStorageKey } from '../../auth/services/auth.service';
import {
  executarLimpezaLocalFabricaIsoPro,
  listarChavesLocalStorageIsoPro,
} from './fabricaLimpezaLocal.service';

const { mockLimparRelatorios, mockInvalidate, mockResetSupabase } = vi.hoisted(() => ({
  mockLimparRelatorios: vi.fn(() =>
    Promise.resolve({ success: true as const, data: { removidosCatalogo: 0, chavesPayload: 0 } }),
  ),
  mockInvalidate: vi.fn(),
  mockResetSupabase: vi.fn(),
}));

vi.mock('../../relatorios/services/relatorioFotografico.service', () => ({
  limparTodosRelatoriosFotograficosLocais: () => mockLimparRelatorios(),
}));

vi.mock('../../../lib/isoProSnapshot', () => ({
  invalidateIsoProSnapshotCache: () => mockInvalidate(),
}));

vi.mock('../../../lib/supabase', () => ({
  resetSupabaseClient: () => mockResetSupabase(),
}));

describe('fabricaLimpezaLocal.service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('lista apenas chaves geridas pelo app para o ambiente activo (Principal)', () => {
    localStorage.setItem('iso-pro-desktop-materiais', 'x');
    localStorage.setItem('outro-prefixo', 'y');
    localStorage.setItem('iso-pro-desktop-session', 'z');
    localStorage.setItem('iso-pro-desktop-materiais::ambiente:outra-obra', 'shadow');
    expect(listarChavesLocalStorageIsoPro()).toEqual(['iso-pro-desktop-materiais', 'iso-pro-desktop-session']);
  });

  it('remove chaves iso-pro-desktop-*, limpa relatorios, invalida snapshot e regista auditoria', async () => {
    localStorage.setItem('iso-pro-desktop-materiais', '[]');
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

    const r = await executarLimpezaLocalFabricaIsoPro();
    expect(r.success).toBe(true);
    expect(r.success && r.data?.chavesRemovidas).toBe(2);
    expect(listarChavesLocalStorageIsoPro()).toEqual([getScopedIsoProStorageKey('iso-pro-desktop-auth-audit')]);
    expect(mockLimparRelatorios).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockResetSupabase).toHaveBeenCalledTimes(1);
    const auditRaw = localStorage.getItem(getAuthAuditStorageKey());
    expect(auditRaw).toBeTruthy();
    const audit = JSON.parse(auditRaw!) as { type: string; actorLogin: string }[];
    expect(audit[0]?.type).toBe('fabrica_limpeza_local_executada');
    expect(audit[0]?.actorLogin).toBe('admin');
  });
});
