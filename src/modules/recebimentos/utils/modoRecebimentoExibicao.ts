import type { Recebimento } from '../types/recebimento.types';

function conferenciaFinalizadaRegistrada(dataConferencia: string | undefined): boolean {
  return Boolean(dataConferencia && String(dataConferencia).trim());
}

/**
 * Coluna «Modo» na listagem:
 * - `direto` = NF criada em modo direto (sem fluxo de conferência operacional).
 * - `conferencia_concluida` = conferência fechada (`status` conferido): modo atual `aguardando_conferencia`,
 *   ou legado em que `modo` foi gravado como `direto` mas existe `dataConferencia` (ex.: app móvel antigo).
 */
export function textoModoRecebimentoListagem(
  modo: Recebimento['modoRecebimento'],
  status: Recebimento['status'],
  dataConferencia?: string,
): string {
  if (status === 'conferido' && conferenciaFinalizadaRegistrada(dataConferencia) && modo === 'direto') {
    return 'conferencia_concluida';
  }
  if (modo === 'direto') {
    return 'direto';
  }
  if (modo === 'aguardando_conferencia' && status === 'conferido') {
    return 'conferencia_concluida';
  }
  return 'aguardando_conferencia';
}
