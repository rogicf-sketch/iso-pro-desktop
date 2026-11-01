/**
 * Junta cliente / projeto / UO sem repetir trechos já contidos noutro
 * (ex.: "I.S.O PRO GESTÃO DE MATERIAIS" + "GESTÃO DE MATERIAIS" → uma só linha).
 */
export function juntarEscopoLinhaRir(...partes: Array<string | null | undefined>): string {
  const limpas = [
    ...new Set(partes.map((s) => String(s ?? '').trim()).filter((s) => s.length > 0)),
  ];
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  const filtradas = limpas.filter((parte) => {
    const pn = norm(parte);
    return !limpas.some((outra) => {
      if (outra === parte) return false;
      const on = norm(outra);
      return on.length > pn.length && on.includes(pn);
    });
  });
  return filtradas.join(' · ') || '—';
}
