/**
 * Registro do titular / licenciante embutido na compilacao (nao configuravel na UI).
 *
 * Antes de gerar uma builds de distribuicao, preenche nome e CNPJ abaixo.
 * Valores vazios = bloco oculto na sidebar e no login.
 *
 * Nota juridica: isto documenta quem declaras como titular na linha de codigo;
 * nao substitui contrato, registo de marca ou titularidade legal do software.
 */

/** Deixe vazio para nao exibir nome na sidebar / login. */
export const ISO_PRO_TITULAR_SISTEMA_NOME = '';

/** CNPJ ou outro identificador fiscal; texto livre (ex.: 00.000.000/0001-00). */
export const ISO_PRO_TITULAR_SISTEMA_CNPJ = '66.234.531/0001-57';

/** Linha unica para exibir na UI (sidebar / login); null se ambos vazios. */
export function getTitularSistemaLinhaResumo(): string | null {
  const n = ISO_PRO_TITULAR_SISTEMA_NOME.trim();
  const c = ISO_PRO_TITULAR_SISTEMA_CNPJ.trim();
  if (!n && !c) return null;
  if (c && !n) return c;
  const parts: string[] = [];
  if (n) parts.push(`Nome: ${n}`);
  if (c) parts.push(n ? `CNPJ: ${c}` : c);
  return parts.join(' · ');
}
