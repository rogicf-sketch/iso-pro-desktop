/** Pesquisa por trecho, por várias palavras (cada uma deve aparecer) ou por iniciais dos nomes (ex.: «js» → João Silva). */
export function labelMatchesSearch(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = label.toLowerCase();
  if (hay.includes(q)) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((t) => hay.includes(t));
  }

  const words = label
    .split(/[\s—\-|/]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return false;
  let qi = 0;
  for (const w of words) {
    const first = w.charAt(0).toLowerCase();
    if (first && q[qi] === first) qi += 1;
    if (qi >= q.length) return true;
  }
  return false;
}

/** Prefixo do rótulo antes de " Rev." (numero do desenho no Atendimento). */
export function labelDocumentoNumero(label: string): string {
  return (label.split(/\s+Rev\.\s/i)[0] ?? label).trim();
}

/**
 * Resolve opção a partir do texto digitado: label/value exactos, ou numero do documento
 * (ex.: digitar E.RAZN010-IE6-00002-ABOVE selecciona "… Rev. A - …").
 */
export function resolveSearchableOption<T extends { value: string; label: string }>(
  options: readonly T[],
  query: string,
): T | undefined {
  const t = query.trim().toLowerCase();
  if (!t) return undefined;

  const exact = options.find(
    (o) => o.label.trim().toLowerCase() === t || o.value.trim().toLowerCase() === t,
  );
  if (exact) return exact;

  const byNumero = options.filter((o) => labelDocumentoNumero(o.label).toLowerCase() === t);
  if (byNumero.length === 1) return byNumero[0];

  const byPrefix = options.filter((o) => {
    const label = o.label.trim().toLowerCase();
    return label.startsWith(t) && (label.length === t.length || /[\s—\-]/.test(label.charAt(t.length)));
  });
  if (byPrefix.length === 1) return byPrefix[0];

  return undefined;
}
