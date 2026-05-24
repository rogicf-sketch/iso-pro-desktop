/**
 * Contrato do payload `iso_pro_snapshot` partilhado entre o I.S.O PRO desktop e o app campo.
 * Formato alinhado ao `montarDadosParaSalvar()` do I.S.O PRO (HTML).
 */

export type ModoRecebimento = 'direto' | 'aguardando_conferencia';
export type StatusConferencia = 'pendente' | 'conferido';

export interface RecebimentoItem {
  codigo?: string;
  descricao?: string;
  quantidade?: number | string;
  quantidadeConferida?: number | string | null;
  /** Notas por linha (ex.: divergência na conferência, embalagem, lote). Sincronizado desktop ↔ mobile pelo snapshot. */
  observacaoItem?: string;
  unidade?: string;
  disciplina?: string;
  [key: string]: unknown;
}

/** Cadastro de materiais (código = chave; código de barras = hash determinístico no web). */
export interface Material {
  id?: string | number;
  codigo?: string;
  descricao?: string;
  unidade?: string;
  [key: string]: unknown;
}

/** Cadastro em Configurações / colaboradores no I.S.O PRO. */
export interface Colaborador {
  id: string | number;
  nome?: string;
  matricula?: string;
  funcao?: string;
  telefone?: string;
}

export interface Recebimento {
  id: string | number;
  data?: string;
  fornecedorId?: number;
  fornecedorNome?: string;
  nota?: string;
  romaneio?: string;
  conferenteId?: number;
  conferenteNome?: string;
  observacoes?: string;
  itens?: RecebimentoItem[];
  dataCriacao?: string;
  modoRecebimento?: ModoRecebimento;
  statusConferencia?: StatusConferencia | null;
  dataConferencia?: string | null;
}

/** Documento de planejamento (aba Planejamento no I.S.O PRO). */
export interface DocumentoItemPlanejamento {
  codigo?: string;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
  quantidadeAtendida?: number;
  [key: string]: unknown;
}

export interface DocumentoPlanejamento {
  id: string | number;
  numero?: string;
  revisao?: string;
  data?: string;
  descricao?: string;
  responsavel?: string;
  itens?: DocumentoItemPlanejamento[];
}

export interface AtendimentoLote {
  id: string | number;
  numero?: string;
  data?: string;
  tipo?: string;
  documento?: string;
  atendente?: string;
  matricula?: string;
  atendenteFuncao?: string;
  recebedor?: string;
  recebedorMatricula?: string;
  recebedorFuncao?: string;
}

export interface AtendimentoHistoricoLinha {
  id?: number;
  loteId?: string | number;
  loteNumero?: string;
  data?: string;
  documento?: string;
  documentoId?: string | number | null;
  /** Id da linha do planejamento — alinha com o I.S.O PRO desktop / reconciliação do snapshot. */
  documentoItemId?: string | number | null;
  codigo?: string;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
  atendente?: string;
  matricula?: string;
  atendenteFuncao?: string;
  recebedor?: string;
  recebedorMatricula?: string;
  recebedorFuncao?: string;
  /** Canal de registro no snapshot (alinhado ao desktop). */
  origem?: 'mobile' | 'windows';
}

/** Linha de inventário (snapshot `inventarios[].itens`). */
export interface InventarioItemSnapshot {
  id?: string;
  codigoMaterial?: string;
  descricaoMaterial?: string;
  unidade?: string;
  saldoSistema?: number;
  quantidadeContada?: number;
}

/** Inventário alinhado ao I.S.O PRO desktop (snapshot `inventarios`). */
export interface InventarioSnapshot {
  id?: string;
  codigo?: string;
  descricao?: string;
  responsavel?: string;
  dataInventario?: string;
  status?: 'aberto' | 'fechado' | 'cancelado';
  /** Sincronizado com o PC: só inventários com esta flag aparecem para contagem no app. */
  contagemMobileHabilitada?: boolean;
  observacoes?: string;
  itens?: InventarioItemSnapshot[];
}

export interface IsoSnapshotPayload {
  materiais?: Material[];
  fornecedores?: unknown[];
  colaboradores?: Colaborador[];
  recebimentos?: Recebimento[];
  rirRegistros?: unknown[];
  rncRegistros?: unknown[];
  documentos?: DocumentoPlanejamento[];
  atendimentoHistorico?: AtendimentoHistoricoLinha[];
  atendimentoLotes?: AtendimentoLote[];
  inventarios?: InventarioSnapshot[];
  /** Etiquetas de identificacao / segregacao (desktop). */
  etiquetas?: unknown[];
  estoqueAjustes?: unknown[];
  configuracoesSistema?: Record<string, unknown>;
  usuariosSistema?: unknown;
  disciplinas?: string[];
  unidades?: string[];
  versao?: string;
  dataAtualizacao?: string;
}
