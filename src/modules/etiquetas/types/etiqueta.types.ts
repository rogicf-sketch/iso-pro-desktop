export type EtiquetaModelo =
  | 'simples'
  | 'colorido'
  | 'industrial'
  | 'cartao'
  | 'segregacao'
  | 'liberacao';

export type EtiquetaFormato = 'a4_2col' | 'a4_1col' | 'termica_58' | 'termica_80';

/** Codigos graficos opcionais nas etiquetas de recebimento (impressao/pre-visualizacao). */
export type EtiquetaCodigosOpcao = 'nenhum' | 'codigo_barras' | 'qrcode' | 'ambos';

export type Etiqueta = {
  id: string;
  titulo: string;
  codigo: string;
  descricao: string;
  modelo: EtiquetaModelo;
  formato: EtiquetaFormato;
  larguraMm: number;
  alturaMm: number;
  moduloOrigem: 'materiais' | 'recebimentos' | 'qualidade' | 'livre';
  referenciaId: string;
  quantidadeCopias: number;
  status: 'rascunho' | 'pronta' | 'impressa' | 'cancelada';
  criadoPor: string;
  dataCriacao: string;
  observacoes: string;
};

export type EtiquetaFormData = Omit<Etiqueta, 'id' | 'status' | 'dataCriacao'>;

export type EtiquetaListItem = Omit<Etiqueta, 'descricao' | 'observacoes'>;

export type EtiquetaFiltro = {
  busca: string;
  modelo: 'todos' | EtiquetaModelo;
  formato: 'todos' | EtiquetaFormato;
  status: 'todos' | Etiqueta['status'];
  page: number;
  pageSize: number;
};
