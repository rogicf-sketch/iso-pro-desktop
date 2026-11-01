import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSupabase: vi.fn(),
  hasSupabaseConfig: vi.fn(() => true),
  getActiveTenantId: vi.fn(() => '00000000-0000-0000-0000-000000000001'),
}));

vi.mock('./supabase', () => ({
  getSupabase: mocks.getSupabase,
  hasSupabaseConfig: mocks.hasSupabaseConfig,
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: mocks.getActiveTenantId,
}));

import { writeConfiguracoesSotOnCloud } from './configuracoesTabelas';

describe('writeConfiguracoesSotOnCloud', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.getSupabase.mockReturnValue({ rpc: mocks.rpc });
    mocks.hasSupabaseConfig.mockReturnValue(true);
  });

  it('chama iso_pro_write_configuracoes_sot', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-06T00:00:00.000Z', error: null });
    const r = await writeConfiguracoesSotOnCloud({
      baselineUpdatedAt: '2026-08-05T00:00:00.000Z',
      configuracoes: { tema: 'campo' },
      disciplinas: ['ELET'],
      unidades: ['UN'],
    });
    expect(r.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_configuracoes_sot', {
      p_tenant_id: '00000000-0000-0000-0000-000000000001',
      p_baseline: '2026-08-05T00:00:00.000Z',
      p_configuracoes: { tema: 'campo' },
      p_disciplinas: ['ELET'],
      p_unidades: ['UN'],
    });
  });

  it('RPC ausente → hard-fail SotRpcRequiredError', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_configuracoes_sot', code: 'PGRST202' },
    });
    await expect(
      writeConfiguracoesSotOnCloud({
        baselineUpdatedAt: '2026-08-05T00:00:00.000Z',
        configuracoes: {},
      }),
    ).rejects.toThrow(/SoT obrigatório/);
  });
});
