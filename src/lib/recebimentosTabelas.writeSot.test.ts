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

import { writeRecebimentosSotOnCloud } from './recebimentosTabelas';

describe('writeRecebimentosSotOnCloud', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('grava via RPC table-first', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-02T20:00:00.000Z', error: null });
    const result = await writeRecebimentosSotOnCloud({
      baselineUpdatedAt: '2026-08-02T19:00:00.000Z',
      upsert: [{ id: 'r1', fornecedorNome: 'F' }],
    });
    expect(result.missing).toBe(false);
    expect(result.updatedAt).toContain('2026-08-02');
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_recebimentos_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_baseline: '2026-08-02T19:00:00.000Z',
      p_upsert: [{ id: 'r1', fornecedorNome: 'F' }],
      p_remove_ids: null,
      p_replace_all: null,
    });
  });

  it('hard-fail quando RPC nao existe (sot_require_rpc)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_recebimentos_sot', code: 'PGRST202' },
    });
    const { SotRpcRequiredError } = await import('./sotWriteGuard');
    await expect(
      writeRecebimentosSotOnCloud({
        baselineUpdatedAt: null,
        removeIds: ['r1'],
      }),
    ).rejects.toBeInstanceOf(SotRpcRequiredError);
  });

  it('propaga conflito OCC', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'ISO_PRO_SNAPSHOT_CONFLICT' },
    });
    await expect(
      writeRecebimentosSotOnCloud({
        baselineUpdatedAt: 'old',
        replaceAll: [],
      }),
    ).rejects.toBeInstanceOf(IsoProSnapshotConflictError);
  });
});
