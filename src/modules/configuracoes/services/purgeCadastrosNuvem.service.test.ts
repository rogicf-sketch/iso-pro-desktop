/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMPAR_CADASTROS_FRASE_NUVEM } from '../constants/limparCadastros.constants';
import { executarPurgeCadastrosNuvem } from './purgeCadastrosNuvem.service';

const TENANT_FIXO = '22222222-2222-4222-8222-222222222222';

const {
  mockHasSupabaseConfig,
  mockGetSupabase,
  mockGetActiveTenantId,
  mockInvalidateIsoProSnapshotCache,
} = vi.hoisted(() => ({
  mockHasSupabaseConfig: vi.fn(() => true),
  mockGetSupabase: vi.fn(),
  mockGetActiveTenantId: vi.fn(() => TENANT_FIXO),
  mockInvalidateIsoProSnapshotCache: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: () => mockGetActiveTenantId(),
}));

vi.mock('../../../lib/isoProSnapshot', () => ({
  invalidateIsoProSnapshotCache: () => mockInvalidateIsoProSnapshotCache(),
}));

describe('purgeCadastrosNuvem.service', () => {
  beforeEach(() => {
    mockHasSupabaseConfig.mockReturnValue(true);
    mockGetActiveTenantId.mockReturnValue(TENANT_FIXO);
    mockGetSupabase.mockReturnValue({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { ok: true, message: 'Cadastros limpos.' },
          error: null,
        }),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recusa frase incorrecta e nao chama invoke', async () => {
    const invoke = vi.fn();
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

    const r = await executarPurgeCadastrosNuvem({
      login: 'admin',
      senha: 'x',
      confirmFrase: 'ERRADO',
    });

    expect(r.success).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(mockInvalidateIsoProSnapshotCache).not.toHaveBeenCalled();
  });

  it('envia tenantId do getActiveTenantId no body do purge_cloud_cadastros', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, message: 'ok' },
      error: null,
    });
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

    const r = await executarPurgeCadastrosNuvem({
      login: 'Operador',
      senha: 'pw',
      confirmFrase: LIMPAR_CADASTROS_FRASE_NUVEM,
    });

    expect(r.success).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      'purge_cloud_cadastros',
      expect.objectContaining({
        body: expect.objectContaining({
          tenantId: TENANT_FIXO,
          login: 'operador',
          senha: 'pw',
          confirmFrase: LIMPAR_CADASTROS_FRASE_NUVEM,
        }),
      }),
    );
    expect(mockInvalidateIsoProSnapshotCache).toHaveBeenCalledTimes(1);
  });
});
