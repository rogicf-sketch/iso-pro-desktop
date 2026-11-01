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

vi.mock('./isoProJwtSession', () => ({
  clearIsoProJwtSession: vi.fn(),
  ensureIsoProDataSessionReadable: vi.fn(),
}));

import { writeDocumentosSotOnCloud } from './documentosPlanejamentoTabelas';
import { SotRpcRequiredError } from './sotWriteGuard';

describe('writeDocumentosSotOnCloud', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('grava via RPC table-first preservando contrato', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-02T22:00:00.000Z', error: null });
    const result = await writeDocumentosSotOnCloud({
      documentos: [{ id: 'd1', numero: 'N1', itens: [{ id: 'i1', quantidadeAtendida: 5 }] }],
      baselineUpdatedAt: '2026-08-02T21:00:00.000Z',
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_documentos_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_documentos: [{ id: 'd1', numero: 'N1', itens: [{ id: 'i1', quantidadeAtendida: 5 }] }],
      p_baseline: '2026-08-02T21:00:00.000Z',
      p_atendimento_historico: null,
      p_atendimentos: null,
    });
  });

  it('hard-fail quando RPC ausente e sot_require_rpc on', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_documentos_sot', code: 'PGRST202' },
    });
    await expect(
      writeDocumentosSotOnCloud({ documentos: [], baselineUpdatedAt: null }),
    ).rejects.toBeInstanceOf(SotRpcRequiredError);
  });

  it('propaga conflito OCC', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'ISO_PRO_SNAPSHOT_CONFLICT' },
    });
    await expect(
      writeDocumentosSotOnCloud({ documentos: [{ id: 'x' }], baselineUpdatedAt: 'old' }),
    ).rejects.toBeInstanceOf(IsoProSnapshotConflictError);
  });
});
