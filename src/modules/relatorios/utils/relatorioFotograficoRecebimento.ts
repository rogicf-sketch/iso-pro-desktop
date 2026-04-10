import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';

/** Remove prefixo NF- / NF: para comparar números de nota. */
export function nfNormalizada(s: string): string {
  return s
    .trim()
    .replace(/^NF[-\s.:_]*/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Localiza recebimento pelo texto digitado (NF).
 * Primeiro tenta igualdade no sufixo; depois parcial.
 */
export function encontrarRecebimentoPorNf(
  itens: RecebimentoListItem[],
  digitado: string,
): RecebimentoListItem | undefined {
  const k = nfNormalizada(digitado);
  if (!k) return undefined;

  const exato = itens.find((r) => nfNormalizada(r.notaFiscal ?? '') === k);
  if (exato) return exato;

  return itens.find(
    (r) =>
      nfNormalizada(r.notaFiscal ?? '').includes(k) ||
      (r.notaFiscal ?? '').toLowerCase().includes(digitado.trim().toLowerCase()),
  );
}
