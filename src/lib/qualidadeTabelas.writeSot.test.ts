/**
 * SoT table-first RIR write — unit (RPC mock).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getActiveTenantId: vi.fn(() => 'tenant-test'),
  hasSupabaseConfig: vi.fn(() => true),
  getSupabase: vi.fn(),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: mocks.getActiveTenantId,
}));

vi.mock('./supabase', () => ({
  hasSupabaseConfig: mocks.hasSupabaseConfig,
  getSupabase: mocks.getSupabase,
}));

import { writeRirSotOnCloud, writeRncSotOnCloud } from './qualidadeTabelas';
import { SotRpcRequiredError } from './sotWriteGuard';

describe('writeRirSotOnCloud / writeRncSotOnCloud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseConfig.mockReturnValue(true);
    mocks.getSupabase.mockReturnValue({ rpc: mocks.rpc });
  });

  it('chama iso_pro_write_rir_sot com replaceAll', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-03T12:00:00.000Z', error: null });
    const result = await writeRirSotOnCloud({
      baselineUpdatedAt: '2026-08-03T11:00:00.000Z',
      replaceAll: [{ id: 'r1', codigo: 'RIR-1' }],
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_rir_sot', {
      p_tenant_id: 'tenant-test',
      p_baseline: '2026-08-03T11:00:00.000Z',
      p_upsert: null,
      p_remove_ids: null,
      p_replace_all: [{ id: 'r1', codigo: 'RIR-1' }],
      p_idempotency_key: null,
    });
  });

  it('envia idempotency_key para evitar duplicar apos retry de rede', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-03T12:00:00.000Z', error: null });
    await writeRirSotOnCloud({
      baselineUpdatedAt: null,
      replaceAll: [{ id: 'r1' }],
      idempotencyKey: 'rir-key-1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'iso_pro_write_rir_sot',
      expect.objectContaining({ p_idempotency_key: 'rir-key-1' }),
    );
  });

  it('chama iso_pro_write_rnc_sot', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-03T12:00:00.000Z', error: null });
    const result = await writeRncSotOnCloud({
      baselineUpdatedAt: null,
      upsert: [{ id: 'n1' }],
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_rnc_sot', expect.objectContaining({
      p_upsert: [{ id: 'n1' }],
    }));
  });

  it('hard-fail SotRpcRequiredError quando RPC ausente', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_rir_sot', code: 'PGRST202' },
    });
    await expect(
      writeRirSotOnCloud({ baselineUpdatedAt: null, replaceAll: [] }),
    ).rejects.toBeInstanceOf(SotRpcRequiredError);
  });
});
