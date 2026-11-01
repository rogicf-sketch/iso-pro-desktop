import { describe, expect, it, vi } from 'vitest';
import { fetchAllExportRpcPages } from './exportRpcPages';

describe('fetchAllExportRpcPages', () => {
  it('devolve uma pagina quando total <= pageSize', async () => {
    const rpc = vi.fn(async () => ({
      data: { rows: [{ a: 1 }, { a: 2 }], total: 2, _source: 'tables' },
      error: null,
    }));
    const supabase = { rpc } as never;
    const result = await fetchAllExportRpcPages<{ a: number }>({
      supabase,
      rpcName: 'iso_pro_export_test',
      tenantId: 't1',
      pageSize: 5000,
      waveConcurrency: 1,
    });
    expect(result.error).toBeUndefined();
    expect(result.rows).toEqual([{ a: 1 }, { a: 2 }]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('dispara a primeira onda em paralelo desde offset 0', async () => {
    const rpc = vi.fn(async (_name: string, args: { p_offset: number; p_limit: number }) => {
      const all = Array.from({ length: 12 }, (_, i) => ({ i }));
      const slice = all.slice(args.p_offset, args.p_offset + args.p_limit);
      return {
        data: {
          rows: slice,
          total: args.p_offset === 0 ? 12 : -1,
          _source: 'tables',
        },
        error: null,
      };
    });
    const supabase = { rpc } as never;
    const result = await fetchAllExportRpcPages<{ i: number }>({
      supabase,
      rpcName: 'iso_pro_export_test',
      tenantId: 't1',
      pageSize: 5,
      waveConcurrency: 3,
    });
    expect(result.rows.map((r) => r.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // 1.ª onda: 0,5,10 (3 pedidos) — cobre os 12 sem segunda onda.
    expect(rpc.mock.calls.length).toBe(3);
  });

  it('marca missingRpc quando a funcao nao existe', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'Could not find the function public.iso_pro_export_test' },
    }));
    const result = await fetchAllExportRpcPages({
      supabase: { rpc } as never,
      rpcName: 'iso_pro_export_test',
      tenantId: 't1',
    });
    expect(result.missingRpc).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it('fetchAllExportCsvChunks junta chunks em ondas', async () => {
    const { fetchAllExportCsvChunks } = await import('./exportRpcPages');
    const rpc = vi.fn(async (_name: string, args: { p_offset: number; p_limit: number }) => {
      const start = args.p_offset;
      const n = Math.min(args.p_limit, Math.max(0, 12 - start));
      const lines = Array.from({ length: n }, (_, i) => `L${start + i}`);
      return {
        data: { chunk: lines.join('\n'), n, _source: 'tables' },
        error: null,
      };
    });
    const result = await fetchAllExportCsvChunks({
      supabase: { rpc } as never,
      rpcName: 'iso_pro_export_csv',
      tenantId: 't1',
      pageSize: 5,
      waveConcurrency: 3,
    });
    expect(result.missingRpc).toBeUndefined();
    expect(result.rowCount).toBe(12);
    expect(result.format).toBe('');
    expect(result.chunks.join('\n').split('\n')).toEqual([
      'L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11',
    ]);
  });
});
