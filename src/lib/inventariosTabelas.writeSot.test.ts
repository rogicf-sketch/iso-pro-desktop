import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from './isoProSnapshot';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({
  hasSupabaseConfig: () => true,
  getSupabase: () => ({ rpc: mocks.rpc }),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

import { writeInventariosSotOnCloud } from './inventariosTabelas';

describe('writeInventariosSotOnCloud', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('grava upsert (1 inventario) via RPC table-first', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-02T21:00:00.000Z', error: null });
    const result = await writeInventariosSotOnCloud({
      baselineUpdatedAt: '2026-08-02T20:00:00.000Z',
      upsert: [{ id: 'inv-1', codigo: 'I1' }],
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_inventarios_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_baseline: '2026-08-02T20:00:00.000Z',
      p_upsert: [{ id: 'inv-1', codigo: 'I1' }],
      p_remove_ids: null,
      p_replace_all: null,
    });
  });

  it('hard-fail quando RPC nao existe (sot_require_rpc)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_inventarios_sot', code: 'PGRST202' },
    });
    const { SotRpcRequiredError } = await import('./sotWriteGuard');
    await expect(
      writeInventariosSotOnCloud({ baselineUpdatedAt: null, upsert: [] }),
    ).rejects.toBeInstanceOf(SotRpcRequiredError);
  });

  it('propaga conflito OCC', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'ISO_PRO_SNAPSHOT_CONFLICT' },
    });
    await expect(
      writeInventariosSotOnCloud({
        baselineUpdatedAt: 'old',
        upsert: [{ id: 'x' }],
      }),
    ).rejects.toBeInstanceOf(IsoProSnapshotConflictError);
  });
});
