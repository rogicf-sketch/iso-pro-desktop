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
