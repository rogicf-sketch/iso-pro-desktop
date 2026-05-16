export type InventarioItem = {
  id: string;
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  saldoSistema: number;
  quantidadeContada: number;
};

export type Inventario = {
  id: string;
  codigo: string;
  descricao: string;
  responsavel: string;
  dataInventario: string;
  status: 'aberto' | 'fechado' | 'cancelado';
  /** Quando true, o inventário aberto pode aparecer no app mobile para contagem (criado no PC). */
  contagemMobileHabilitada: boolean;
  observacoes: string;
  itens: InventarioItem[];
};

export type InventarioFormData = Omit<Inventario, 'id' | 'status'>;

export type InventarioListItem = Omit<Inventario, 'itens' | 'observacoes'> & {
  totalItens: number;
  divergencias: number;
};

export type InventarioFiltro = {
  busca: string;
  status: 'todos' | Inventario['status'];
  page: number;
  pageSize: number;
};
