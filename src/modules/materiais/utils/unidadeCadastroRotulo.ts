/**
 * Rótulos amigáveis só no modal «Unidades».
 * Nos formulários/listagens continua a gravar e mostrar apenas a sigla (UN, PC, …).
 */

/** Descrições padrão das unidades de fábrica (não altera o valor persistido). */
export const DESCRICOES_UNIDADE_PADRAO: Readonly<Record<string, string>> = {
  UN: 'Unidade',
  M: 'Metro',
  KG: 'Quilograma',
  PC: 'Peça',
  MT: 'Metro',
};

export function normalizarSiglaUnidade(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Texto mostrado no cadastro de unidades: `UN — Unidade`. */
export function rotuloUnidadeCadastro(
  sigla: string,
  descricoesExtras?: Readonly<Record<string, string>>,
): string {
  const key = normalizarSiglaUnidade(sigla);
  if (!key) return sigla;
  const descricao =
    (descricoesExtras?.[key] ?? descricoesExtras?.[sigla] ?? DESCRICOES_UNIDADE_PADRAO[key] ?? '').trim();
  return descricao ? `${key} — ${descricao}` : key;
}
