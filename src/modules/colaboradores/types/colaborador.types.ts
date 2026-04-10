export type ColaboradorTipo = 'interno' | 'externo';

export type Colaborador = {
  id: string;
  nome: string;
  tipo: ColaboradorTipo;
  matricula: string;
  funcao: string;
  empresa: string;
  documento: string;
  telefone: string;
  observacao: string;
  ativo: boolean;
};

export type ColaboradorFormData = Omit<Colaborador, 'id'>;

export type ColaboradorFiltro = {
  busca: string;
  tipo: 'todos' | ColaboradorTipo;
  status: 'todos' | 'ativos' | 'inativos';
  page: number;
  pageSize: number;
};
