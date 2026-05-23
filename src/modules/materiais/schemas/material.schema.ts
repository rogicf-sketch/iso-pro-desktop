import type { MaterialFormData } from '../types/material.types';

export function validateMaterial(data: MaterialFormData) {
  if (!data.codigo.trim()) return 'Informe o codigo do material.';
  if (!data.descricao.trim()) return 'Informe a descricao do material.';
  if (!data.disciplina.trim()) return 'Informe a disciplina.';
  if (!data.unidade.trim()) return 'Informe a unidade.';
  if (data.peso < 0) return 'Peso nao pode ser negativo.';
  if (data.estoqueMinimo < 0) return 'Percentual de alerta nao pode ser negativo.';
  if (data.estoqueMinimo > 100) return 'Percentual de alerta deve ser entre 0 e 100.';

  const cb = data.codigoBarras?.trim() ?? '';
  if (cb && !/^\d{8,14}$/.test(cb)) {
    return 'Codigo de barras deve ter apenas digitos (8 a 14 caracteres), ou deixe vazio para gerar automaticamente.';
  }

  return null;
}
