export type AtendimentoRecebedorTipo = 'interno' | 'externo';

export type AtendimentoItem = {
  id: string;
  documentoItemId: string;
  materialId: string | null;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  quantidadeAtendida: number;
  /** Numero do desenho / documento de planejamento desta linha (historico mobile ou exibicao no recibo). */
  documentoNumero?: string;
};

export type Atendimento = {
  id: string;
  numero: string;
  documentoId: string;
  documentoNumero: string;
  atendente: string;
  /** Preenchidos quando o atendente coincide com colaborador cadastrado (recibo / histórico). */
  atendenteMatricula?: string;
  atendenteFuncao?: string;
  recebedorTipo: AtendimentoRecebedorTipo;
  recebedorColaboradorId: string | null;
  recebedor: string;
  /** Preenchidos a partir do cadastro de colaboradores (interno ou retirante externo). */
  recebedorMatricula?: string;
  recebedorFuncao?: string;
  recebedorEmpresa: string;
  recebedorDocumento: string;
  recebedorTelefone: string;
  autorizadorInterno: string;
  motivoRetirada: string;
  /** Canal de registro: desktop Windows ou app mobile (quando integrado). */
  origem: 'windows' | 'mobile';
  status: 'concluido' | 'estornado';
  dataAtendimento: string;
  itens: AtendimentoItem[];
};

export type AtendimentoDocumentoLinha = {
  documentoItemId: string;
  materialId: string | null;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  quantidadeProjeto: number;
  quantidadeAtendida: number;
  quantidadePendente: number;
  saldoDisponivel: number;
  quantidadeNestaOperacao: number;
};

export type AtendimentoDocumento = {
  id: string;
  numero: string;
  revisao: string;
  descricao: string;
  responsavel: string;
  status: string;
  linhas: AtendimentoDocumentoLinha[];
};

/** Dados extras para recibo de impressao (documento + quem retirou), capturados no momento do registro. */
export type DadosReciboAtendimento = {
  atendimento: Atendimento;
  documentoDescricao: string;
  documentoRevisao: string;
  documentoResponsavel: string;
  /** Nome de quem retirou o material (colaborador interno ou retirante externo). */
  nomeAtendido: string;
  /**
   * URL do logo (https, caminho no app ex. /recibo-logo.png em public, ou data URL).
   * Se omitido, o gerador do HTML tenta localStorage `iso-pro-desktop-recibo-logo-url`; senao, area para logo a esquerda.
   */
  logoUrl?: string | null;
  detalhesRetiradaExterna?: {
    documentoIdentificacao: string;
    telefone: string;
    autorizadorInterno: string;
    motivoRetirada: string;
  };
};

/** Linha enviada ao estornar parcialmente (por id do item do lote de atendimento). */
export type EstornoAtendimentoLinha = {
  atendimentoItemId: string;
  quantidade: number;
};

/** Dados para impressao do recibo de estorno (reversao da retirada). */
export type DadosReciboEstorno = {
  atendimento: Atendimento;
  documentoNumero: string;
  documentoRevisao: string;
  documentoDescricao: string;
  documentoResponsavel: string;
  /** Quem registra o estorno no sistema (operador). */
  nomeQuemEstorna: string;
  /** Quem devolve o material fisicamente. */
  nomeQuemDevolve: string;
  motivoEstorno: string;
  /** Itens e quantidades devolvidas nesta operacao (pode ser subconjunto do lote). */
  itensEstorno: AtendimentoItem[];
  /** True se nem todo o material do lote foi estornado nesta operacao. */
  estornoParcial: boolean;
  logoUrl?: string | null;
};
