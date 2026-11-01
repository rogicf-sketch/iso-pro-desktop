import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./isoProTenant', () => ({ getActiveTenantId: () => 'tenant-1' }));
vi.mock('./supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  getSupabase: vi.fn(),
}));
vi.mock('./isoProFeatureFlags', () => ({
  isFeatureEnabled: vi.fn(() => true),
}));
vi.mock('./sotFallbackTelemetry', () => ({
  recordSotFallback: vi.fn(),
}));

import { writeMateriaisSotOnCloud } from './materiaisTabelas';
import { getSupabase } from './supabase';
import { SotRpcRequiredError } from './sotWriteGuard';

describe('materiaisTabelas SoT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chama iso_pro_write_materiais_sot', async () => {
    const rpc = vi.fn(async () => ({ data: '2026-08-04T00:00:00Z', error: null }));
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    const r = await writeMateriaisSotOnCloud({
      baselineUpdatedAt: null,
      upsert: [{ id: '1', codigo: 'A' }],
    });
    expect(r.missing).toBe(false);
    expect(rpc).toHaveBeenCalledWith(
      'iso_pro_write_materiais_sot',
      expect.objectContaining({
        p_tenant_id: 'tenant-1',
        p_upsert: [{ id: '1', codigo: 'A' }],
      }),
    );
  });

  it('hard-fail quando RPC ausente e sot_require_rpc on', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_materiais_sot' },
    }));
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    await expect(
      writeMateriaisSotOnCloud({ baselineUpdatedAt: null, upsert: [{ id: '1' }] }),
    ).rejects.toBeInstanceOf(SotRpcRequiredError);
  });
});
