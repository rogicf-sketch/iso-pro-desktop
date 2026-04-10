export type Material = {
  id: string;
  codigo: string;
  /** EAN-13 numerico; gerado automaticamente na criacao/import se vazio. */
  codigoBarras: string;
  descricao: string;
  diametro: string;
  disciplina: string;
  unidade: string;
  peso: number;
  estoqueMinimo: number;
  saldoAtual: number;
  ativo: boolean;
  observacao: string;
};

export type MaterialFormData = Omit<Material, 'id' | 'saldoAtual'>;

export type MaterialListItem = Pick<
  Material,
  'id' | 'codigo' | 'codigoBarras' | 'descricao' | 'disciplina' | 'unidade' | 'peso' | 'estoqueMinimo' | 'saldoAtual' | 'ativo'
>;

export type MaterialFiltro = {
  busca: string;
  disciplina: string;
  ativo: 'todos' | 'ativos' | 'inativos';
  page: number;
  pageSize: number;
};
