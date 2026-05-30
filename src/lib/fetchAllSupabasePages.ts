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
