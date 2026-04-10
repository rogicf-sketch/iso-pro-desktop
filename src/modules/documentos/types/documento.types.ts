export type DocumentoItem = {
  id: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  quantidadeProjeto: number;
  quantidadeAtendida: number;
};

export type Documento = {
  id: string;
  numero: string;
  revisao: string;
  descricao: string;
  responsavel: string;
  dataDocumento: string;
  status: 'pendente' | 'parcial' | 'recebido' | 'atendido' | 'cancelado';
  observacao: string;
  itens: DocumentoItem[];
};

export type DocumentoFormData = Omit<Documento, 'id' | 'status'>;

export type DocumentoListItem = Omit<Documento, 'itens' | 'observacao'> & {
  totalItens: number;
  quantidadePlanejada: number;
  quantidadeAtendida: number;
};

export type DocumentoFiltro = {
  busca: string;
  status: 'todos' | Documento['status'];
  page: number;
  pageSize: number;
};

/** Arquivo gerado por Exportar documentos (JSON). */
export type DocumentosArquivoExportacao = {
  schemaVersion: number;
  exportedAt: string;
  documentos: Documento[];
};

export type DocumentosImportacaoResumo = {
  criados: number;
  atualizados: number;
  ignorados: number;
  detalhes: string[];
};
