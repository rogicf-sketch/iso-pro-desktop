import { Button } from '../ui/Button';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pagination">
      <span>
        Pagina <strong>{page}</strong> de <strong>{totalPages}</strong> · {total} registro(s)
      </span>

      <div className="pagination-actions">
        <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} variant="ghost">
          Anterior
        </Button>
        <Button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} variant="ghost">
          Proxima
        </Button>
      </div>
    </div>
  );
}
