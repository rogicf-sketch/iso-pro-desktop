/**
 * Decimal flexivel para CSV/planilhas (PT-BR vs internacional).
 *
 * - `12,5` ou `0,35` → virgula vira separador decimal (quando nao ha ponto na string).
 * - `12.5` ou `0.35` → ponto como decimal.
 * - Se existirem **virgula e ponto** ao mesmo tempo (ex.: `1.234,56`), a string nao e
 *   normalizada aqui; `Number` pode falhar — prefira um formato sem ambiguidade no arquivo.
 */
export function parseDecimalFlexible(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const normalized = t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
