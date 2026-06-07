/** Sigla → nome completo no relatorio impresso (nao usar sigla crua na auditoria). */
export const DISCIPLINA_NOME_POR_SIGLA_RIR: Record<string, string> = {
  TUB: 'Tubulação',
  MEC: 'Mecânica',
  INS: 'Instrumentação',
  ELE: 'Elétrica',
};

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

/** Extrai sigla do codigo RIR (ex.: RIR-TUB-02 → TUB). */
export function extrairDisciplinaCodigoRir(codigo: string): string {
  const m = String(codigo || '')
    .trim()
    .match(/^RIR-([A-Z]{2,10})-/i);
  return m ? m[1].toUpperCase() : '';
}

export function resolverDisciplinaRir(input: {
  disciplinaManual?: string;
  procedimentoNumero?: string;
  codigo?: string;
  itensRir?: Array<{ disciplina?: string }>;
}): string {
  const manual = String(input.disciplinaManual ?? '').trim();
  if (manual) return manual;

  const fromProc = extrairDisciplinaProcedimento(input.procedimentoNumero ?? '');
  if (fromProc) return fromProc;

  const fromCodigo = extrairDisciplinaCodigoRir(input.codigo ?? '');
  if (fromCodigo) return fromCodigo;

  const fromItens = (input.itensRir ?? [])
    .map((it) => String(it.disciplina ?? '').trim())
    .filter(Boolean);
  if (fromItens.length === 0) return '';

  const counts = new Map<string, number>();
  for (const d of fromItens) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Converte sigla (TUB) ou texto parcial para nome completo no relatorio. */
export function formatarDisciplinaExibicaoRir(disciplina: string): string {
  const raw = String(disciplina ?? '').trim();
  if (!raw) return '—';

  const sigla = raw.toUpperCase();
  const porSigla = DISCIPLINA_NOME_POR_SIGLA_RIR[sigla];
  if (porSigla) return porSigla;

  const porSiglaParcial = DISCIPLINA_NOME_POR_SIGLA_RIR[sigla.replace(/[^A-Z]/g, '')];
  if (porSiglaParcial) return porSiglaParcial;

  return raw;
}
