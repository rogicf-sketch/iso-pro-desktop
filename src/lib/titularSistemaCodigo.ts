/**
 * Registro do titular / licenciante embutido na compilacao (nao configuravel na UI).
 *
 * Antes de gerar uma builds de distribuicao, preenche nome e CNPJ abaixo.
 * Valores vazios = bloco oculto na sidebar e no login.
 *
 * Nota juridica: isto documenta quem declaras como titular na linha de codigo;
 * nao substitui contrato, registo de marca ou titularidade legal do software.
 */

export const ISO_PRO_TITULAR_SISTEMA_NOME = 'Igor Sousa de Oliveira';

/** CNPJ ou outro identificador fiscal; texto livre (ex.: 00.000.000/0001-00). */
export const ISO_PRO_TITULAR_SISTEMA_CNPJ = '';

/** Linha unica para exibir na UI (sidebar / login); null se ambos vazios. */
export function getTitularSistemaLinhaResumo(): string | null {
  const n = ISO_PRO_TITULAR_SISTEMA_NOME.trim();
  const c = ISO_PRO_TITULAR_SISTEMA_CNPJ.trim();
  if (!n && !c) return null;
  const parts: string[] = [];
  if (n) parts.push(`Nome: ${n}`);
  if (c) parts.push(`CNPJ: ${c}`);
  return parts.join(' · ');
}
