import type { ColaboradorFormData } from '../types/colaborador.types';

export function validateColaborador(data: ColaboradorFormData) {
  if (!data.nome.trim()) return 'Informe o nome do colaborador.';
  if (data.tipo === 'externo' && !data.empresa.trim()) return 'Informe a empresa do retirante externo.';
  if (data.tipo === 'externo' && !data.documento.trim()) return 'Informe o documento do retirante externo.';
  return null;
}
