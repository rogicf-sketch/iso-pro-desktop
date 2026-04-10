type PaginatedLoaderResult<T> = {
  data?: {
    items: T[];
    total: number;
    pageSize: number;
  };
};

export async function collectAllPages<T>(
  loader: (page: number, pageSize: number) => Promise<PaginatedLoaderResult<T>>,
  defaultPageSize = 200,
) {
  const firstPage = await loader(1, defaultPageSize);
  const firstItems = firstPage.data?.items ?? [];
  const total = firstPage.data?.total ?? firstItems.length;
  const pageSize = firstPage.data?.pageSize ?? defaultPageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages === 1) {
    return firstItems;
  }

  const restPages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => loader(index + 2, pageSize)));
  return [firstItems, ...restPages.map((page) => page.data?.items ?? [])].flat();
}
