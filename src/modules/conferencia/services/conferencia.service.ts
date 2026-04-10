import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { buscarRecebimentoPorId, finalizarConferenciaRecebimento, listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import type { Conferencia, ConferenciaFiltro, ConferenciaListItem } from '../types/conferencia.types';

function mapRecebimentoToConferencia(item: Recebimento): Conferencia {
  return {
    id: item.id,
    fornecedor: item.fornecedor,
    dataRecebimento: item.dataRecebimento,
    notaFiscal: item.notaFiscal,
    romaneio: item.romaneio,
    conferente: item.conferente,
    status: item.status,
    observacoes: item.observacoes,
    itens: item.itens,
  };
}

export async function listarConferencias(filtro: ConferenciaFiltro): Promise<ServiceResult<PaginatedResult<ConferenciaListItem>>> {
  const result = await listarRecebimentos({
    busca: filtro.busca,
    status: filtro.status === 'todos' ? 'todos' : filtro.status,
    modo: 'aguardando_conferencia',
    page: filtro.page,
    pageSize: filtro.pageSize,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'Nao foi possivel carregar conferencias.' };
  }

  return { success: true, data: result.data, meta: result.meta };
}

export async function buscarConferenciaPorId(id: string): Promise<ServiceResult<Conferencia>> {
  const result = await buscarRecebimentoPorId(id);
  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'Conferencia nao encontrada.' };
  }
  if (result.data.status === 'cancelado') {
    return { success: false, error: 'Recebimento cancelado nao pode ser aberto para conferencia.' };
  }
  return { success: true, data: mapRecebimentoToConferencia(result.data) };
}

export async function concluirConferencia(payload: {
  id: string;
  conferente: string;
  observacoes: string;
  itens: Array<{ id: string; quantidadeConferida: number }>;
}): Promise<ServiceResult<Conferencia>> {
  const current = await buscarRecebimentoPorId(payload.id);
  if (!current.success || !current.data) {
    return { success: false, error: current.error ?? 'Conferencia nao encontrada.' };
  }
  if (current.data.status === 'cancelado') {
    return { success: false, error: 'Recebimento cancelado nao pode ser conferido.' };
  }
  if (current.data.status === 'conferido') {
    return { success: false, error: 'Este recebimento ja esta totalmente conferido.' };
  }

  const result = await finalizarConferenciaRecebimento(payload);
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error ?? 'Nao foi possivel concluir a conferencia.',
      meta: result.meta,
    };
  }
  return { success: true, data: mapRecebimentoToConferencia(result.data), meta: result.meta };
}
