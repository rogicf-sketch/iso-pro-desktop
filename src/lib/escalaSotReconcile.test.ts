import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  captureOperationalEvent: vi.fn(),
}));

vi.mock('./supabase', () => ({
  getSupabase: () => ({ rpc: mocks.rpc }),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

vi.mock('./errorReporting', () => ({
  captureOperationalEvent: mocks.captureOperationalEvent,
}));

import { reconcileEscalaSot, runEscalaSotReconcileBestEffort } from './escalaSotReconcile';

describe('escalaSotReconcile', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.captureOperationalEvent.mockReset();
  });

  it('mapeia dominio alinhado', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        domains: {
          recebimentos: {
            snapshotCount: 2,
            tableCount: 2,
            missingInTableCount: 0,
            missingInSnapshotCount: 0,
            missingInTable: [],
            missingInSnapshot: [],
            aligned: true,
            healed: false,
          },
        },
        diverged: [],
        healed: false,
      },
      error: null,
    });

    const result = await reconcileEscalaSot({ heal: false });
    expect(result?.ok).toBe(true);
    expect(result?.domains.recebimentos?.tableCount).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_reconcile_escala_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_heal: false,
    });
  });

  it('regista falha local quando ha divergencia', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: false,
        domains: {
          recebimentos: {
            snapshotCount: 3,
            tableCount: 1,
            missingInTableCount: 2,
            missingInSnapshotCount: 0,
            missingInTable: ['a', 'b'],
            missingInSnapshot: [],
            aligned: false,
            healed: false,
          },
        },
        diverged: ['recebimentos'],
        healed: true,
      },
      error: null,
    });

    const result = await runEscalaSotReconcileBestEffort({ heal: true, source: 'test' });
    expect(result?.ok).toBe(false);
    expect(mocks.captureOperationalEvent).toHaveBeenCalledWith(
      'sot_divergence',
      expect.objectContaining({
        source: 'test',
        domain: 'recebimentos',
      }),
      'warning',
    );
  });
});
