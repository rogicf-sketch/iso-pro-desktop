/** Situação operacional no canteiro (frota / locação). */
export type EquipamentoStatusOperacao = 'operando' | 'manutencao' | 'parado' | 'em_transito';

export type Equipamento = {
  id: string;
  /** Número de frota (identificador interno; pode coincidir com patrimônio) */
  codigo: string;
  tipoEquipamento: string;
  placa: string;
  nomeOperador: string;
  telefoneOperador: string;
  setorResponsavel: string;
  empresaContratada: string;
  /** ISO date yyyy-mm-dd */
  dataInicioProjeto: string;
  /** ISO date yyyy-mm-dd */
  dataFimContrato: string;
  valorContrato: number | null;
  numeroContrato: string;
  statusEquipamento: EquipamentoStatusOperacao;
  observacoes: string;
  dataCadastro: string;
};

export type EquipamentoFormData = Omit<Equipamento, 'id' | 'dataCadastro'>;

export type SituacaoContratoFiltro = 'todos' | 'vencido' | 'proximo_30' | 'em_dia' | 'sem_prazo';

export type EquipamentoFiltro = {
  busca: string;
  statusOperacao: 'todos' | EquipamentoStatusOperacao;
  situacaoContrato: SituacaoContratoFiltro;
  page: number;
  pageSize: number;
};

export type EquipamentoIndicadores = {
  total: number;
  proximosVencer30: number;
  contratosVencidos: number;
  emOperacao: number;
};
