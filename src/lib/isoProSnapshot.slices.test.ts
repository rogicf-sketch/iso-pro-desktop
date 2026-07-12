import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '00000000-0000-0000-0000-000000000001',
}));

import { getSupabase } from './supabase';
import {
  commitIsoProSnapshotPatch,
  invalidateIsoProSnapshotCache,
  readIsoProSnapshotSlices,
  readIsoProSnapshotStats,
} from './isoProSnapshot';

const mockedGetSupabase = vi.mocked(getSupabase);

describe('isoProSnapshot slices', () => {
  beforeEach(() => {
    invalidateIsoProSnapshotCache();
    vi.clearAllMocks();
  });

  it('readIsoProSnapshotSlices usa RPC e cacheia', async () => {
    const rpc = vi.fn(async () => ({
      data: { _updatedAt: '2026-06-07T12:00:00.000Z', recebimentos: [{ id: 'r1' }] },
      error: null,
    }));
    mockedGetSupabase.mockReturnValue({ rpc } as never);

    const a = await readIsoProSnapshotSlices<{ recebimentos: { id: string }[] }>(['recebimentos']);
    const b = await readIsoProSnapshotSlices<{ recebimentos: { id: string }[] }>(['recebimentos']);

    expect(a.recebimentos?.[0]?.id).toBe('r1');
    expect(b.recebimentos?.[0]?.id).toBe('r1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('readIsoProSnapshotStats interpreta resposta RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, payloadBytes: 4096, updatedAt: '2026-06-07T12:00:00.000Z' },
      error: null,
    }));
    mockedGetSupabase.mockReturnValue({ rpc } as never);

    const stats = await readIsoProSnapshotStats();
    expect(stats?.payloadBytes).toBe(4096);
    expect(stats?.updatedAt).toContain('2026-06-07');
  });

  it('commitIsoProSnapshotPatch grava via RPC patch', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'iso_pro_patch_snapshot') {
        return { data: '2026-06-07T12:00:01.000Z', error: null };
      }
      return { data: null, error: null };
    });
    mockedGetSupabase.mockReturnValue({ rpc } as never);

    await commitIsoProSnapshotPatch(async () => ({
      baselineUpdatedAt: '2026-06-07T12:00:00.000Z',
      patch: { recebimentos: [{ id: 'x' }], dataAtualizacao: '2026-06-07T12:00:01.000Z' },
    }));

    expect(rpc).toHaveBeenCalledWith('iso_pro_patch_snapshot', expect.objectContaining({
      p_baseline: '2026-06-07T12:00:00.000Z',
    }));
  });
});
