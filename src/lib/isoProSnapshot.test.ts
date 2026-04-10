import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import {
  commitIsoProSnapshotWrite,
  invalidateIsoProSnapshotCache,
  IsoProSnapshotConflictError,
  isIsoProSnapshotConflictError,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
  SNAPSHOT_CONFLICT_MESSAGE,
  upsertIsoProSnapshotPayload,
} from './isoProSnapshot';

const mockedGetSupabase = vi.mocked(getSupabase);

type MaybeSingleResult = { data: unknown; error: { message: string } | null };
type UpdateSelectResult = { data: unknown; error: { message: string } | null };

function createTableMockHandlers(handlers: {
  maybeSingle?: () => Promise<MaybeSingleResult>;
  upsert?: () => Promise<{ error: { message: string } | null }>;
  updateSelect?: () => Promise<UpdateSelectResult>;
}) {
  const maybeSingle = vi.fn(handlers.maybeSingle ?? (async () => ({ data: { payload: { seed: true }, updated_at: '2026-01-01T00:00:00.000Z' }, error: null })));
  const upsert = vi.fn(handlers.upsert ?? (async () => ({ error: null })));
  const updateSelect = vi.fn(
    handlers.updateSelect ?? (async () => ({ data: [{ id: 'default' }] as const, error: null })),
  );

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle,
      })),
    })),
    upsert,
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => updateSelect()),
        })),
      })),
    })),
  }));

  return { from, maybeSingle, upsert, updateSelect };
}

describe('isoProSnapshot', () => {
  beforeEach(() => {
    invalidateIsoProSnapshotCache();
    vi.clearAllMocks();
  });

  describe('isIsoProSnapshotConflictError', () => {
    it('identifica IsoProSnapshotConflictError', () => {
      expect(isIsoProSnapshotConflictError(new IsoProSnapshotConflictError())).toBe(true);
      expect(isIsoProSnapshotConflictError(new Error(SNAPSHOT_CONFLICT_MESSAGE))).toBe(false);
      expect(isIsoProSnapshotConflictError('x')).toBe(false);
    });
  });

  describe('readIsoProSnapshotPayloadForWrite', () => {
    it('lanca quando Supabase nao esta configurado', async () => {
      mockedGetSupabase.mockReturnValue(null);
      await expect(readIsoProSnapshotPayloadForWrite()).rejects.toThrow('Supabase nao configurado.');
    });

    it('retorna baselineUpdatedAt null quando nao ha linha', async () => {
      const { from, maybeSingle } = createTableMockHandlers({
        maybeSingle: async () => ({ data: null, error: null }),
      });
      mockedGetSupabase.mockReturnValue({ from } as never);

      const { payload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite();
      expect(baselineUpdatedAt).toBeNull();
      expect(payload).toEqual({});
      expect(maybeSingle).toHaveBeenCalledTimes(1);
    });
  });

  describe('readIsoProSnapshotPayload (cache)', () => {
    it('reusa resultado dentro do TTL sem novo maybeSingle', async () => {
      let calls = 0;
      const { from, maybeSingle } = createTableMockHandlers({
        maybeSingle: async () => {
          calls += 1;
          return { data: { payload: { n: calls }, updated_at: '2026-01-02T00:00:00.000Z' }, error: null };
        },
      });
      mockedGetSupabase.mockReturnValue({ from } as never);

      const a = await readIsoProSnapshotPayload<{ n: number }>();
      const b = await readIsoProSnapshotPayload<{ n: number }>();

      expect(a.n).toBe(1);
      expect(b.n).toBe(1);
      expect(maybeSingle).toHaveBeenCalledTimes(1);
    });

    it('volta a buscar apos invalidateIsoProSnapshotCache', async () => {
      let calls = 0;
      const { from, maybeSingle } = createTableMockHandlers({
        maybeSingle: async () => {
          calls += 1;
          return { data: { payload: { n: calls }, updated_at: '2026-01-02T00:00:00.000Z' }, error: null };
        },
      });
      mockedGetSupabase.mockReturnValue({ from } as never);

      await readIsoProSnapshotPayload<{ n: number }>();
      invalidateIsoProSnapshotCache();
      const second = await readIsoProSnapshotPayload<{ n: number }>();

      expect(second.n).toBe(2);
      expect(maybeSingle).toHaveBeenCalledTimes(2);
    });
  });

  describe('upsertIsoProSnapshotPayload', () => {
    it('usa upsert quando baselineUpdatedAt e null', async () => {
      const { from, upsert } = createTableMockHandlers({});
      mockedGetSupabase.mockReturnValue({ from } as never);

      await upsertIsoProSnapshotPayload({ doc: 1 }, null);

      expect(upsert).toHaveBeenCalledTimes(1);
    });

    it('lanca IsoProSnapshotConflictError quando update nao afeta linhas', async () => {
      const { from, updateSelect } = createTableMockHandlers({
        updateSelect: async () => ({ data: [], error: null }),
      });
      mockedGetSupabase.mockReturnValue({ from } as never);

      await expect(upsertIsoProSnapshotPayload({ x: 1 }, '2026-01-01T00:00:00.000Z')).rejects.toBeInstanceOf(
        IsoProSnapshotConflictError,
      );
      expect(updateSelect).toHaveBeenCalled();
    });
  });

  describe('commitIsoProSnapshotWrite', () => {
    it('retenta prepare quando ha conflito e completa na segunda tentativa', async () => {
      let updateCalls = 0;
      const { from, updateSelect } = createTableMockHandlers({
        updateSelect: async () => {
          updateCalls += 1;
          if (updateCalls === 1) return { data: [], error: null };
          return { data: [{ id: 'default' }], error: null };
        },
      });
      mockedGetSupabase.mockReturnValue({ from } as never);

      const prepare = vi.fn(async () => ({
        nextPayload: { v: updateCalls },
        baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
      }));

      await commitIsoProSnapshotWrite(prepare, { maxAttempts: 3 });

      expect(prepare).toHaveBeenCalledTimes(2);
      expect(updateSelect).toHaveBeenCalledTimes(2);
    });

    it('para apos maxAttempts e propaga conflito', async () => {
      const { from } = createTableMockHandlers({
        updateSelect: async () => ({ data: [], error: null }),
      });
      mockedGetSupabase.mockReturnValue({ from } as never);

      const prepare = vi.fn(async () => ({
        nextPayload: { a: 1 },
        baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
      }));

      await expect(commitIsoProSnapshotWrite(prepare, { maxAttempts: 2 })).rejects.toBeInstanceOf(IsoProSnapshotConflictError);
      expect(prepare).toHaveBeenCalledTimes(2);
    });
  });
});
