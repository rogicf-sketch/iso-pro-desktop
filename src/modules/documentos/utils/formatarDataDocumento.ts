/** Exibição pt-BR da data do documento (armazenada em geral como YYYY-MM-DD). */
export function formatarDataDocumentoPtBr(valor: string | undefined | null): string {
  const t = String(valor ?? '').trim();
  if (!t) return '—';

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (isoDate) {
    return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  }

  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (brDate) {
    return t;
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString('pt-BR');
}
