/**
 * Lotes gerados por `scripts/load-test-atendimento-comandos.mjs` (prefixo ATD-LOAD / load-at-).
 * Nao sao retiradas reais — nao devem aparecer no historico operacional.
 */
export function isSyntheticLoadTestAtendimento(input: {
  id?: string | null;
  numero?: string | null;
}): boolean {
  const numero = String(input.numero ?? '').trim();
  const id = String(input.id ?? '').trim();
  if (numero.startsWith('ATD-LOAD-')) return true;
  if (numero.startsWith('LOAD-') && !numero.startsWith('LOAD-DOC')) return true;
  if (id.startsWith('load-at-')) return true;
  return false;
}

/** Preferir data real; nunca inventar "agora" (isso faz fantasmas entrarem no filtro Hoje). */
export function resolveDataAtendimentoIso(
  raw: string | null | undefined,
  fallback?: string | null,
): string {
  const primary = String(raw ?? '').trim();
  if (primary) return primary;
  const secondary = String(fallback ?? '').trim();
  if (secondary) return secondary;
  return '';
}
