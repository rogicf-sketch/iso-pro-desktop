export type RelatorioIndicador = {
  id: string;
  titulo: string;
  valor: string;
  descricao: string;
};

export type RelatorioResumo = {
  id: string;
  categoria: 'estoque' | 'planejamento' | 'recebimento' | 'qualidade' | 'mobile' | 'seguranca';
  titulo: string;
  detalhe: string;
  atualizadoEm: string;
};
