import type { FornecedorFormData } from '../types/fornecedor.types';

export function validateFornecedor(data: FornecedorFormData) {
  if (!data.nome.trim()) return 'Informe o nome do fornecedor.';
  if (data.email.trim() && !data.email.includes('@')) return 'Informe um email valido.';
  return null;
}
