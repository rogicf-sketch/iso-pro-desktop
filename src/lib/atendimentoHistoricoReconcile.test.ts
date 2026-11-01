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

vi.mock('./operationalSlo', () => ({
  recordOperationalSlo: vi.fn(),
}));

vi.mock('./isoProFeatureFlags', () => ({
  isFeatureEnabled: () => true,
}));

import {
  reconcileAtendimentoHistorico,
  runAtendimentoHistoricoReconcileBestEffort,
} from './atendimentoHistoricoReconcile';

describe('atendimentoHistoricoReconcile', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.captureOperationalEvent.mockReset();
  });

  it('mapeia historico alinhado e envia batch limit', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        aligned: true,
        diverged: false,
        snapshotCount: 3,
        tableCount: 3,
        missingInTableCount: 0,
        missingInSnapshotCount: 0,
        missingInTable: [],
        missingInSnapshot: [],
        healed: false,
        healedCount: 0,
        healBatchLimit: 40,
      },
      error: null,
    });

    const result = await reconcileAtendimentoHistorico({ heal: false });
    expect(result?.ok).toBe(true);
    expect(result?.aligned).toBe(true);
    expect(result?.diverged).toBe(false);
    expect(result?.tableCount).toBe(3);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_reconcile_atendimento_historico', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_heal: false,
      p_heal_batch_limit: 40,
    });
  });

  it('nao alerta sot_divergence quando snapshot e tabela estao vazios', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        aligned: false,
        diverged: true,
        emptySnapshot: true,
        snapshotCount: 0,
        tableCount: 0,
        missingInTableCount: 0,
        missingInSnapshotCount: 0,
        missingInTable: [],
        missingInSnapshot: [],
        healed: false,
        healedCount: 0,
      },
      error: null,
    });

    await runAtendimentoHistoricoReconcileBestEffort({ source: 'test-empty' });
    expect(mocks.captureOperationalEvent).not.toHaveBeenCalled();
  });

  it('alerta quando historico SoT diverge apos heal', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        aligned: false,
        diverged: true,
        snapshotCount: 5,
        tableCount: 3,
        missingInTableCount: 2,
        missingInSnapshotCount: 0,
        missingInTable: ['a', 'b'],
        missingInSnapshot: [],
        healed: true,
        healedCount: 2,
      },
      error: null,
    });

    await runAtendimentoHistoricoReconcileBestEffort({
      heal: true,
      source: 'test',
    });
    expect(mocks.captureOperationalEvent).toHaveBeenCalledWith(
      'sot_divergence',
      expect.objectContaining({
        source: 'test',
        missingInTableCount: 2,
      }),
      'warning',
    );
  });

  it('retorna null se RPC ausente', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_reconcile_atendimento_historico' },
    });
    // legacy call also missing
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_reconcile_atendimento_historico' },
    });
    const result = await reconcileAtendimentoHistorico();
    // first call fails with missing → tries legacy; if both missing → null
    expect(result === null || result?.error).toBeTruthy();
  });
});
