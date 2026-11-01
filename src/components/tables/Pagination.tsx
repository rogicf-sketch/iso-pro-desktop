import { Button } from '../ui/Button';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Pré-carrega a página ao passar o rato / foco (troca fica instantânea). */
  onPagePrefetch?: (page: number) => void;
  /** Ex.: "materiais" → "Mostrando 1–25 de 3.622 materiais" */
  itemLabel?: string;
};

function buildPageList(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let p = page - 2; p <= page + 2; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  // Prefer a window near the start when on early pages
  if (page <= 4) {
    for (let p = 1; p <= 7; p += 1) pages.add(p);
  }
  if (page >= totalPages - 3) {
    for (let p = totalPages - 6; p <= totalPages; p += 1) {
      if (p >= 1) pages.add(p);
    }
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('ellipsis');
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination({ page, pageSize, total, onPageChange, onPagePrefetch, itemLabel }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pages = buildPageList(safePage, totalPages);
  const label = itemLabel?.trim() || 'registro(s)';
  const warm = (target: number) => {
    if (!onPagePrefetch || target < 1 || target > totalPages || target === safePage) return;
    onPagePrefetch(target);
  };

  return (
    <div className="pagination pagination--rich">
      <span className="pagination-range">
        {total === 0
          ? `Nenhum ${label}`
          : `Mostrando ${from}–${to} de ${total.toLocaleString('pt-BR')} ${label}`}
      </span>

      <div className="pagination-actions">
        <Button
          aria-label="Página anterior"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          onPointerEnter={() => warm(safePage - 1)}
          onFocus={() => warm(safePage - 1)}
          variant="ghost"
        >
          ‹
        </Button>
        {pages.map((entry, idx) =>
          entry === 'ellipsis' ? (
            <span className="pagination-ellipsis" key={`e-${idx}`}>
              …
            </span>
          ) : (
            <Button
              aria-current={entry === safePage ? 'page' : undefined}
              aria-label={`Página ${entry}`}
              className={entry === safePage ? 'pagination-page is-active' : 'pagination-page'}
              key={entry}
              onClick={() => onPageChange(entry)}
              onPointerEnter={() => warm(entry)}
              onFocus={() => warm(entry)}
              variant={entry === safePage ? 'primary' : 'ghost'}
            >
              {entry}
            </Button>
          ),
        )}
        <Button
          aria-label="Próxima página"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          onPointerEnter={() => warm(safePage + 1)}
          onFocus={() => warm(safePage + 1)}
          variant="ghost"
        >
          ›
        </Button>
      </div>
    </div>
  );
}
