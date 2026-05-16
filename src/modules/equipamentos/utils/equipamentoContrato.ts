/** Situação do contrato face à data de hoje (apenas quando há data fim). */
export type SituacaoContrato = 'vencido' | 'proximo' | 'em_dia' | 'sem_prazo';

export function diasAteFimContrato(dataFim: string): number | null {
  const t = dataFim.trim();
  if (!t) return null;
  const fim = new Date(`${t}T12:00:00`);
  if (Number.isNaN(fim.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86_400_000);
}

export function situacaoContratoFromDias(dias: number | null): SituacaoContrato {
  if (dias === null) return 'sem_prazo';
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'proximo';
  return 'em_dia';
}

export function labelSituacaoContrato(s: SituacaoContrato): string {
  if (s === 'vencido') return 'Contrato vencido';
  if (s === 'proximo') return 'Vence em até 30 dias';
  if (s === 'em_dia') return 'Contrato em dia';
  return 'Sem data de fim';
}
