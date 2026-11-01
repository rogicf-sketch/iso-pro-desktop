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

import {
  writeEquipamentosSotOnCloud,
  writeEtiquetasSotOnCloud,
  writeFornecedoresSotOnCloud,
} from './cadastrosTabelas';
import { SotRpcRequiredError } from './sotWriteGuard';

describe('writeFornecedoresSotOnCloud / writeEquipamentosSotOnCloud / writeEtiquetasSotOnCloud', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('grava fornecedores via RPC table-first', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-03T21:00:00.000Z', error: null });
    const result = await writeFornecedoresSotOnCloud({
      baselineUpdatedAt: '2026-08-03T20:00:00.000Z',
      replaceAll: [{ id: 'for-1', nome: 'Acme' }],
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_fornecedores_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_baseline: '2026-08-03T20:00:00.000Z',
      p_replace_all: [{ id: 'for-1', nome: 'Acme' }],
    });
  });

  it('grava equipamentos via RPC table-first', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-03T21:00:00.000Z', error: null });
    const result = await writeEquipamentosSotOnCloud({
      baselineUpdatedAt: null,
      replaceAll: [{ id: 'eq-1', codigo: 'PAT-1' }],
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_equipamentos_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_baseline: null,
      p_replace_all: [{ id: 'eq-1', codigo: 'PAT-1' }],
    });
  });

  it('grava etiquetas via RPC table-first', async () => {
    mocks.rpc.mockResolvedValue({ data: '2026-08-03T21:00:00.000Z', error: null });
    const result = await writeEtiquetasSotOnCloud({
      baselineUpdatedAt: '2026-08-03T19:00:00.000Z',
      replaceAll: [{ id: 'etq-1', titulo: 'T' }],
    });
    expect(result.missing).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith('iso_pro_write_etiquetas_sot', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
      p_baseline: '2026-08-03T19:00:00.000Z',
      p_replace_all: [{ id: 'etq-1', titulo: 'T' }],
    });
  });

  it('hard-fail SotRpcRequiredError quando RPC nao existe', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_write_fornecedores_sot', code: 'PGRST202' },
    });
    await expect(
      writeFornecedoresSotOnCloud({
        baselineUpdatedAt: null,
        replaceAll: [],
      }),
    ).rejects.toBeInstanceOf(SotRpcRequiredError);
  });

  it('propaga conflito OCC', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'ISO_PRO_SNAPSHOT_CONFLICT' },
    });
    await expect(
      writeEquipamentosSotOnCloud({
        baselineUpdatedAt: 'old',
        replaceAll: [{ id: 'x' }],
      }),
    ).rejects.toBeInstanceOf(IsoProSnapshotConflictError);
  });
});
