import type { EquipamentoFormData } from '../types/equipamento.types';

export function validateEquipamento(data: EquipamentoFormData): string | null {
  if (!data.tipoEquipamento.trim()) return 'Informe o tipo de equipamento.';
  if (!data.placa.trim()) return 'Informe a placa ou identificação do equipamento.';
  if (!data.nomeOperador.trim()) return 'Informe o nome do operador responsável.';
  return null;
}
