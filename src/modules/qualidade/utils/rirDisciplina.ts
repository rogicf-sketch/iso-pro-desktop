/**
 * Extrai sigla de disciplina do nº do procedimento (ex.: PE-TUB-003 REV.2 → TUB).
 * Alinhado ao fluxo legado I.S.O PRO.
 */
export function extrairDisciplinaProcedimento(s: string): string {
  const line = String(s || '')
    .trim()
    .split(/\s+/)[0];
  let m = line.match(/^[A-Z]{1,}-([A-Z]{2,10})-\d+/i);
  if (m) return m[1].toUpperCase();
  m = line.match(/^([A-Z]{2,10})-\d+/i);
  return m ? m[1].toUpperCase() : '';
}
