export type RecebimentoItem = {
  id: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  disciplina: string;
  /** Endereco / posicao de estoque do material no recebimento (obrigatorio na operacao). */
  localizacao: string;
  quantidadeRecebida: number;
  quantidadeConferida: number;
  /** Peso por unidade do material (ex.: kg por peca/metro). */
  pesoUnitario: number;
  /** Peso total da linha (ex.: kg). */
  pesoTotal: number;
  /** Certificado do material (importacao planilha ou digitacao); usado no RIR. Ausente em dados antigos = tratado como vazio. */
  certificado?: string;
};

export type Recebimento = {
  id: string;
  fornecedor: string;
  dataRecebimento: string;
  notaFiscal: string;
  romaneio: string;
  conferente: string;
  modoRecebimento: 'direto' | 'aguardando_conferencia';
  status: 'rascunho' | 'aguardando_conferencia' | 'conferido' | 'parcialmente_conferido' | 'divergente' | 'cancelado';
  observacoes: string;
  itens: RecebimentoItem[];
};

export type RecebimentoFormData = Omit<Recebimento, 'id' | 'status'>;

export type RecebimentoListItem = Omit<Recebimento, 'itens' | 'observacoes'> & {
  totalItens: number;
  quantidadeRecebidaTotal: number;
  quantidadeConferidaTotal: number;
  /** Linhas com qtd conferida < qtd recebida (NF) — destaque na lista e no detalhe. */
  conferenciaItensDivergentes: number;
};

export type RecebimentoFiltro = {
  busca: string;
  status: 'todos' | Recebimento['status'];
  modo: 'todos' | Recebimento['modoRecebimento'];
  page: number;
  pageSize: number;
};

export type RecebimentosArquivoExportacao = {
  schemaVersion: number;
  exportedAt: string;
  recebimentos: Recebimento[];
};

export type RecebimentosImportacaoResumo = {
  criados: number;
  atualizados: number;
  ignorados: number;
  detalhes: string[];
};
