import type { Colaborador } from '../../colaboradores/types/colaborador.types';

/**
 * Igual ao autocomplete do atendimento: opções `Nome` ou `Nome - matrícula`;
 * aceita ainda matrícula só ou nome exato (case-insensitive).
 */
export function resolverColaboradorPorTextoAtendente(atendente: string, colaboradores: Colaborador[]): Colaborador | null {
  const t = atendente.trim();
  if (!t) return null;
  const ativos = colaboradores.filter((c) => c.ativo);
  for (const c of ativos) {
    const mat = (c.matricula ?? '').trim();
    const opt = `${c.nome.trim()}${mat ? ` - ${mat}` : ''}`;
    if (opt === t) return c;
  }
  const dash = t.lastIndexOf(' - ');
  if (dash !== -1) {
    const nomePart = t.slice(0, dash).trim();
    const matPart = t.slice(dash + 3).trim();
    for (const c of ativos) {
      const cm = (c.matricula ?? '').trim();
      if (c.nome.trim().toLowerCase() === nomePart.toLowerCase() && cm === matPart) return c;
    }
  }
  const lower = t.toLowerCase();
  for (const c of ativos) {
    if (c.nome.trim().toLowerCase() === lower) return c;
  }
  const matNorm = t.replace(/\s/g, '');
  for (const c of ativos) {
    const cm = (c.matricula ?? '').trim().replace(/\s/g, '');
    if (cm && cm === matNorm) return c;
  }
  return null;
}
