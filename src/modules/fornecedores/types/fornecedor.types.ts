export type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  ativo: boolean;
};

export type FornecedorFormData = Omit<Fornecedor, 'id'>;

export type FornecedorFiltro = {
  busca: string;
  status: 'todos' | 'ativos' | 'inativos';
  page: number;
  pageSize: number;
};
