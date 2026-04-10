import type { DocumentoFormData } from '../types/documento.types';

export function validateDocumento(data: DocumentoFormData) {
  if (!data.numero.trim()) return 'Informe o numero do documento.';
  if (!data.revisao.trim()) return 'Informe a revisao.';
  if (!data.dataDocumento.trim()) return 'Informe a data do documento.';
  if (!data.itens.length) return 'Adicione ao menos um item ao documento.';

  const invalidItem = data.itens.find(
    (item) => !item.codigoMaterial.trim() || !item.descricaoMaterial.trim() || item.quantidadeProjeto <= 0,
  );

  if (invalidItem) {
    return 'Todos os itens precisam ter codigo, descricao e quantidade valida.';
  }

  const duplicatedCodes = new Set<string>();
  for (const item of data.itens) {
    const code = item.codigoMaterial.trim().toLowerCase();
    if (duplicatedCodes.has(code)) {
      return `Nao e permitido repetir o material ${item.codigoMaterial} no mesmo documento.`;
    }
    duplicatedCodes.add(code);
  }

  return null;
}
