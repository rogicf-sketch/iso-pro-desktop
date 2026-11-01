import type { RelatorioResumo, RelatorioTom } from '../types/relatorio.types';

export const RELATORIO_CATEGORIA_LABEL: Record<RelatorioResumo['categoria'], string> = {
  estoque: 'Estoque',
  planejamento: 'Planejamento',
  recebimento: 'Recebimento',
  qualidade: 'Qualidade',
  mobile: 'Mobile',
  seguranca: 'Segurança',
};

export function tomPorContagem(n: number, { dangerAt = Infinity }: { dangerAt?: number } = {}): RelatorioTom {
  if (n <= 0) return 'ok';
  if (n >= dangerAt) return 'danger';
  return 'warning';
}

export function resumoSegurancaExigeAlerta(detalhe: string): boolean {
  const nums = [...detalhe.matchAll(/\d+/g)].map((m) => Number(m[0]));
  return nums.some((n) => n > 0);
}
