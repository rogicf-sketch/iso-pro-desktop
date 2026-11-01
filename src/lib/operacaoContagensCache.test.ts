import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn(async () => ({ data: { ok: true }, error: null }));

vi.mock('./supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  getSupabase: vi.fn(() => ({ rpc: mockRpc })),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: vi.fn(() => 'tenant-1'),
}));

import { invalidateOperacaoContagensBestEffort } from './operacaoContagensCache';
import { getSupabase, hasSupabaseConfig } from './supabase';

describe('invalidateOperacaoContagensBestEffort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
    vi.mocked(getSupabase).mockReturnValue({ rpc: mockRpc } as never);
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('chama RPC de invalidacao', async () => {
    invalidateOperacaoContagensBestEffort();
    await Promise.resolve();
    expect(mockRpc).toHaveBeenCalledWith('iso_pro_invalidate_operacao_contagens', {
      p_tenant_id: 'tenant-1',
    });
  });

  it('nao faz nada sem supabase', () => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(false);
    invalidateOperacaoContagensBestEffort();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
