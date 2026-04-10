import type { RecebimentoFormData } from '../types/recebimento.types';

export function validateRecebimento(data: RecebimentoFormData) {
  if (!data.fornecedor.trim()) return 'Informe o fornecedor.';
  if (!data.dataRecebimento.trim()) return 'Informe a data do recebimento.';
  if (!data.notaFiscal.trim() && !data.romaneio.trim()) return 'Informe ao menos a nota fiscal ou o romaneio.';
  if (data.modoRecebimento === 'aguardando_conferencia' && !data.conferente.trim()) {
    return 'Informe o conferente responsavel para recebimentos que aguardam conferencia.';
  }
  if (!data.itens.length) return 'Adicione ao menos um item ao recebimento.';

  const invalidItem = data.itens.find(
    (item) =>
      !item.codigoMaterial.trim() ||
      !item.descricaoMaterial.trim() ||
      !item.localizacao.trim() ||
      item.quantidadeRecebida <= 0 ||
      item.quantidadeConferida < 0 ||
      item.quantidadeConferida > item.quantidadeRecebida ||
      (item.pesoUnitario ?? 0) < 0 ||
      (item.pesoTotal ?? 0) < 0,
  );

  if (invalidItem) {
    return 'Todos os itens precisam ter codigo, descricao, localizacao e quantidades validas; pesos nao podem ser negativos.';
  }

  return null;
}
