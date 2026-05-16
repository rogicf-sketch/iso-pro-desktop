export type RirStatus = 'aberto' | 'em_analise' | 'tratado' | 'cancelado';
export type RncStatus = 'aberto' | 'em_tratativa' | 'concluido' | 'cancelado';

/** Opção na lista «Buscar recebimento» do formulário RIR. */
export type RirRecebimentoChoice = {
  id: string;
  label: string;
  notaFiscal: string;
  /** Pelo menos um RIR não cancelado já usa este recebimentoId. */
  possuiRirNaoCancelado: boolean;
  rirExistentes: Array<{ id: string; codigo: string; status: RirStatus }>;
};

export type RirLaudo = 'aprovado' | 'reprovado' | 'observacoes';

export type RirItemLinha = {
  id: string;
  codigoMaterial: string;
  quantidade: number;
  unidade: string;
  descricaoMaterial: string;
  certificado: string;
  /** Linha carregada do recebimento: no formulario, material fica bloqueado; apenas certificado editavel. */
  linhaOrigemRecebimento?: boolean;
  disciplina?: string;
  localizacao?: string;
  /** Quantidade conferida no recebimento (quando aplicavel). */
  quantidadeConferida?: number;
};

export type RirAssinaturaBloco = {
  nome: string;
  data: string;
};

export type RirRegistro = {
  id: string;
  codigo: string;
  dataRegistro: string;
  /** Recebimento (NF) no modulo Recebimentos. */
  recebimentoId: string;
  recebimentoNotaFiscal?: string;
  recebimentoFornecedor?: string;
  recebimentoRomaneio?: string;
  recebimentoData?: string;
  /** Obra / contrato (relatorio profissional). */
  uo: string;
  localObra: string;
  contratoNumero: string;
  fornecedorNome: string;
  inspecaoQuantitativa: boolean;
  inspecaoQualitativa: boolean;
  inspecaoDimensional: boolean;
  procedimentoNumero: string;
  /** Sol. compra / pack-list (referencia comercial — modelo RIR em papel). */
  solCompraPackList: string;
  obsCurta: string;
  itensRir: RirItemLinha[];
  instrumentos: string;
  documentosQc: string;
  observacoesQc: string;
  laudo: RirLaudo;
  assinaturaRecebimento: RirAssinaturaBloco;
  assinaturaCq: RirAssinaturaBloco;
  assinaturaCliente: RirAssinaturaBloco;
  /** Campos de tratativa / ISO (lista e fluxo). */
  origem: string;
  responsavel: string;
  descricao: string;
  status: RirStatus;
  acaoImediata: string;
  observacoes: string;
};

export type RncLocalArmazenagem = '' | 'almoxarifado' | 'quarentena' | 'outro';

export type RncTiposOcorrencia = {
  avariaFisica: boolean;
  quantidadeIncorreta: boolean;
  materialIncorreto: boolean;
  documentacaoFaltante: boolean;
  validadeExpirada: boolean;
  outro: boolean;
  outroTexto: string;
};

export type RncEvidencias = {
  fotosAnexadas: boolean;
  copiaPedido: boolean;
  copiaNf: boolean;
  laudoConferencia: boolean;
};

export type RncAcaoImediataTipo = '' | 'devolvido_transportador' | 'quarentena_bloqueado' | 'parcial_item_defeito';

export type RncPlanoAcaoLinha = {
  acao: string;
  responsavel: string;
  prazo: string;
};

export type RncEncerramentoParecer = '' | 'aceito_desvio' | 'rejeitado' | 'reclassificado';

export type RncAssinaturaBloco = {
  nome: string;
  data: string;
};

/** Uma linha da NF com dados espelhados do recebimento + ocorrencia propria (por item). */
export type RncItemLinha = {
  recebimentoItemId: string;
  /** Inclui esta linha no relatorio de NC (cada item pode ter ocorrencia diferente). */
  incluir: boolean;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  disciplina: string;
  localizacao: string;
  quantidadeRecebida: number;
  quantidadeConferida: number;
  pesoUnitario: number;
  pesoTotal: number;
  certificado: string;
  quantidadeRejeitada: number;
  tiposOcorrencia: RncTiposOcorrencia;
  descricaoDetalhada: string;
  /** Fotos em data URL (persistencia local / snapshot). */
  fotosDataUrls: string[];
  /** Quando a evidencia existe fora do sistema (pasta fisica, e-mail, etc.). */
  fotosDeclaradasSemArquivo: boolean;
};

export type RncRegistro = {
  id: string;
  codigo: string;
  dataRegistro: string;
  /** Setor / area (lista e arquivo). */
  setor: string;
  responsavel: string;
  /** Resumo para listagem (derivado da descricao detalhada quando vazio no formulario). */
  descricao: string;
  status: RncStatus;
  /** Texto livre ou derivado das linhas do plano (busca / legado). */
  planoAcao: string;
  observacoes: string;
  /** Vinculo obrigatorio ao modulo Recebimentos. */
  recebimentoId: string;
  recebimentoNotaFiscal?: string;
  recebimentoFornecedor?: string;
  recebimentoRomaneio?: string;
  recebimentoData?: string;
  pedidoCompra: string;
  /** Linha do recebimento usada como referencia do material (opcional). */
  itemRecebimentoId?: string;
  materialCodigo: string;
  materialDescricao: string;
  quantidadeRejeitada: number;
  quantidadeRecebidaRef: number;
  localArmazenagem: RncLocalArmazenagem;
  localArmazenagemOutro: string;
  tiposOcorrencia: RncTiposOcorrencia;
  descricaoDetalhada: string;
  evidencias: RncEvidencias;
  evidenciasObservacao: string;
  acaoImediataTipo: RncAcaoImediataTipo;
  acaoImediataObservacoes: string;
  analiseCausaRaiz: string;
  planoAcaoLinhas: RncPlanoAcaoLinha[];
  encerramentoParecer: RncEncerramentoParecer;
  /** Assinatura do responsavel pelo setor de materiais (datalist de colaboradores no formulario). */
  assinaturaResponsavelRnc: RncAssinaturaBloco;
  /** Assinatura de qualidade / GQ (datalist de colaboradores no formulario). */
  assinaturaQualidade: RncAssinaturaBloco;
  /** Ciencia da contraparte: fornecedor, cliente ou terceiro (texto livre). */
  assinaturaFornecedor: RncAssinaturaBloco;
  /** Itens da NF com ocorrencia por linha (preferencial quando ha linhas no recebimento). */
  itensRnc: RncItemLinha[];
};

export function defaultRncTiposOcorrencia(): RncTiposOcorrencia {
  return {
    avariaFisica: false,
    quantidadeIncorreta: false,
    materialIncorreto: false,
    documentacaoFaltante: false,
    validadeExpirada: false,
    outro: false,
    outroTexto: '',
  };
}

export function defaultRncEvidencias(): RncEvidencias {
  return {
    fotosAnexadas: false,
    copiaPedido: false,
    copiaNf: false,
    laudoConferencia: false,
  };
}

export function defaultRncPlanoLinhas(): RncPlanoAcaoLinha[] {
  return [
    { acao: '', responsavel: '', prazo: '' },
    { acao: '', responsavel: '', prazo: '' },
  ];
}

export type RirFormData = Omit<RirRegistro, 'id' | 'status'> & { status?: RirStatus };
export type RncFormData = Omit<RncRegistro, 'id' | 'status'> & { status?: RncStatus; senhaPreferencial?: string };

export type RirFiltro = {
  busca: string;
  status: 'todos' | RirStatus;
  page: number;
  pageSize: number;
};

export type RncFiltro = {
  busca: string;
  status: 'todos' | RncStatus;
  page: number;
  pageSize: number;
};
