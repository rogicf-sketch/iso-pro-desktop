export type RelatorioTom = 'ok' | 'warning' | 'danger' | 'neutral';

export type RelatorioIndicador = {
  id: string;
  titulo: string;
  valor: string;
  descricao: string;
  href?: string;
  tom?: RelatorioTom;
};

export type RelatorioResumo = {
  id: string;
  categoria: 'estoque' | 'planejamento' | 'recebimento' | 'qualidade' | 'mobile' | 'seguranca';
  titulo: string;
  detalhe: string;
  atualizadoEm: string;
  valorDestaque?: string;
  href?: string;
  tom?: RelatorioTom;
};
