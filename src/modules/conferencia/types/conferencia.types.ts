import type { Recebimento, RecebimentoItem } from '../../recebimentos/types/recebimento.types';

export type ConferenciaListItem = {
  id: string;
  fornecedor: string;
  dataRecebimento: string;
  notaFiscal: string;
  romaneio: string;
  conferente: string;
  status: Recebimento['status'];
  totalItens: number;
  quantidadeRecebidaTotal: number;
  quantidadeConferidaTotal: number;
};

export type Conferencia = {
  id: string;
  fornecedor: string;
  dataRecebimento: string;
  notaFiscal: string;
  romaneio: string;
  conferente: string;
  status: Recebimento['status'];
  observacoes: string;
  itens: RecebimentoItem[];
};

export type ConferenciaFiltro = {
  busca: string;
  status: 'todos' | 'aguardando_conferencia' | 'parcialmente_conferido' | 'divergente' | 'conferido';
  page: number;
  pageSize: number;
};
