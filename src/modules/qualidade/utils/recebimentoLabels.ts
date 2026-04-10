import type { Recebimento } from '../../recebimentos/types/recebimento.types';

export function labelModoRecebimento(m: Recebimento['modoRecebimento']): string {
  return m === 'direto' ? 'Direto — NF conferida / liberada' : 'Aguardando conferencia';
}

export function labelStatusRecebimento(s: Recebimento['status']): string {
  const map: Record<Recebimento['status'], string> = {
    rascunho: 'Rascunho',
    aguardando_conferencia: 'Aguardando conferencia',
    conferido: 'Conferido',
    parcialmente_conferido: 'Parcialmente conferido',
    divergente: 'Divergente',
    cancelado: 'Cancelado',
  };
  return map[s] ?? s;
}
