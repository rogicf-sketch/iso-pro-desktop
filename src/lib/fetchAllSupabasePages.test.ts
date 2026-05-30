import { describe, expect, it } from 'vitest';
import { fetchAllPagesFromSupabase } from './fetchAllSupabasePages';

describe('fetchAllPagesFromSupabase', () => {
  it('devolve uma pagina quando total <= pageSize', async () => {
    const rows = await fetchAllPagesFromSupabase(async (offset, pageSize) => {
      const all = ['a', 'b', 'c'];
      return all.slice(offset, offset + pageSize);
    }, 10);
    expect(rows).toEqual(['a', 'b', 'c']);
  });

  it('concatena varias paginas', async () => {
    const all = Array.from({ length: 1050 }, (_, i) => `m-${i}`);
    const rows = await fetchAllPagesFromSupabase(async (offset, pageSize) => {
      return all.slice(offset, offset + pageSize);
    }, 1000);
    expect(rows).toHaveLength(1050);
    expect(rows[0]).toBe('m-0');
    expect(rows[999]).toBe('m-999');
    expect(rows[1049]).toBe('m-1049');
  });
});
