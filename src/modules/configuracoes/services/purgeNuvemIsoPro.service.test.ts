/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PURGE_CLOUD_FRASE_OPERACIONAL,
  PURGE_CLOUD_FRASE_UTILIZADORES,
} from '../constants/purgeCloud.constants';
import { executarPurgeNuvemIsoPro } from './purgeNuvemIsoPro.service';

const TENANT_FIXO = '11111111-1111-4111-8111-111111111111';

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

describe('purgeNuvemIsoPro.service', () => {
  beforeEach(() => {
    mockHasSupabaseConfig.mockReturnValue(true);
    mockGetActiveTenantId.mockReturnValue(TENANT_FIXO);
    mockGetSupabase.mockReturnValue({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { ok: true, message: 'ok', incluirUtilizadoresEPerfis: false },
          error: null,
        }),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recusa quando a frase operacional esta incorrecta e nao chama invoke', async () => {
    const invoke = vi.fn();
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

    const r = await executarPurgeNuvemIsoPro({
      login: 'admin',
      senha: 'x',
      confirmFraseOperacional: 'FRASE_ERRADA',
      incluirUtilizadoresEPerfis: false,
      confirmFraseUtilizadores: '',
    });

    expect(r.success).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(mockInvalidateIsoProSnapshotCache).not.toHaveBeenCalled();
  });

  it('recusa utilizadores/perfis sem segunda frase correcta', async () => {
    const invoke = vi.fn();
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

    const r = await executarPurgeNuvemIsoPro({
      login: 'admin',
      senha: 'x',
      confirmFraseOperacional: PURGE_CLOUD_FRASE_OPERACIONAL,
      incluirUtilizadoresEPerfis: true,
      confirmFraseUtilizadores: 'errado',
    });

    expect(r.success).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('envia tenantId do getActiveTenantId no body do purge_cloud_data', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, message: 'Purge na nuvem concluida.', incluirUtilizadoresEPerfis: false },
      error: null,
    });
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

    const r = await executarPurgeNuvemIsoPro({
      login: 'Admin',
      senha: 'secret',
      confirmFraseOperacional: PURGE_CLOUD_FRASE_OPERACIONAL,
      incluirUtilizadoresEPerfis: false,
      confirmFraseUtilizadores: '',
    });

    expect(r.success).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      'purge_cloud_data',
      expect.objectContaining({
        body: expect.objectContaining({
          tenantId: TENANT_FIXO,
          login: 'admin',
          senha: 'secret',
          confirmFraseOperacional: PURGE_CLOUD_FRASE_OPERACIONAL,
          incluirUtilizadoresEPerfis: false,
        }),
      }),
    );
    expect(mockInvalidateIsoProSnapshotCache).toHaveBeenCalledTimes(1);
  });

  it('com incluirUtilizadoresEPerfis envia segunda frase no body', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ok: true, message: 'ok', incluirUtilizadoresEPerfis: true },
      error: null,
    });
    mockGetSupabase.mockReturnValue({ functions: { invoke } });

    await executarPurgeNuvemIsoPro({
      login: 'a',
      senha: 'b',
      confirmFraseOperacional: PURGE_CLOUD_FRASE_OPERACIONAL,
      incluirUtilizadoresEPerfis: true,
      confirmFraseUtilizadores: PURGE_CLOUD_FRASE_UTILIZADORES,
    });

    expect(invoke).toHaveBeenCalledWith(
      'purge_cloud_data',
      expect.objectContaining({
        body: expect.objectContaining({
          confirmFraseUtilizadores: PURGE_CLOUD_FRASE_UTILIZADORES,
          incluirUtilizadoresEPerfis: true,
        }),
      }),
    );
  });
});
