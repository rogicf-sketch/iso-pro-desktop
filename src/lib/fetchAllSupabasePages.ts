/** PostgREST/Supabase devolve no maximo 1000 linhas por request sem `.range()`. */
export const SUPABASE_FETCH_PAGE_SIZE = 1000;

/**
 * Carrega todas as linhas de uma consulta paginada Supabase (offset + pageSize).
 */
export async function fetchAllPagesFromSupabase<T>(
  loadPage: (offset: number, pageSize: number) => Promise<T[]>,
  pageSize = SUPABASE_FETCH_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const page = await loadPage(offset, pageSize);
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/**
 * Igual a `fetchAllPagesFromSupabase`, mas busca várias páginas em paralelo (ondas).
 * Com ~28k linhas / 1000, corta dezenas de round-trips sequenciais.
 */
export async function fetchAllPagesFromSupabaseParallel<T>(
  loadPage: (offset: number, pageSize: number) => Promise<T[]>,
  pageSize = SUPABASE_FETCH_PAGE_SIZE,
  concurrency = 6,
): Promise<T[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, 12));
  const first = await loadPage(0, pageSize);
  if (first.length < pageSize) return first;

  const all: T[] = [...first];
  let nextOffset = pageSize;

  while (true) {
    const offsets = Array.from({ length: safeConcurrency }, (_, i) => nextOffset + i * pageSize);
    const pages = await Promise.all(offsets.map((off) => loadPage(off, pageSize)));
    let sawShort = false;
    for (const page of pages) {
      if (page.length === 0) {
        sawShort = true;
        break;
      }
      all.push(...page);
      if (page.length < pageSize) {
        sawShort = true;
        break;
      }
    }
    if (sawShort) break;
    nextOffset += safeConcurrency * pageSize;
  }

  return all;
}
