/**
 * Planilhas (Excel) em PT-BR costumam usar dd/mm/aaaa; o input HTML type=date exige yyyy-mm-dd.
 */

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Converte strings de data comuns (incl. dd/mm/aaaa) para yyyy-mm-dd.
 * Retorna string vazia se nao for possivel interpretar com seguranca.
 */
export function normalizarDataFlexivelParaIso(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  const isoLike = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (isoLike) {
    const y = Number(isoLike[1]);
    const m = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    return isValidYmd(y, m, d) ? s : '';
  }

  const brSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (brSlash) {
    const d = Number(brSlash[1]);
    const m = Number(brSlash[2]);
    const y = Number(brSlash[3]);
    if (!isValidYmd(y, m, d)) return '';
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const brDash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (brDash) {
    const d = Number(brDash[1]);
    const m = Number(brDash[2]);
    const y = Number(brDash[3]);
    if (!isValidYmd(y, m, d)) return '';
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return '';
}
