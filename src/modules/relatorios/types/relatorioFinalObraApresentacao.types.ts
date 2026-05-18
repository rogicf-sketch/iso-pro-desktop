/** Camada de apresentação executiva (síntese + destaques visuais). */
export type SinteseAlertaRfo = {
  nivel: 'critico' | 'atencao' | 'ok';
  texto: string;
};

export type SinteseExecutivaRfo = {
  paragrafos: string[];
  alertas: SinteseAlertaRfo[];
};

export type ResumoRirCertificados = {
  rirTotal: number;
  rirCancelados: number;
  rirComTodosItensCertificados: number;
  rirComLacunaCertificado: number;
  linhasTotal: number;
  linhasComCertificado: number;
  linhasSemCertificado: number;
  laudoAprovado: number;
  laudoReprovado: number;
  laudoObservacoes: number;
};

export type FotoDestaqueRfo = {
  dataUrl: string;
  legenda: string;
};

export type RelatorioFotograficoDestaqueRfo = {
  reportId: string;
  numeroRelatorio: string;
  titulo: string;
  salvoEm: string;
  pontuacao: number;
  motivos: string[];
  notaFiscal: string;
  fornecedor: string;
  fotos: FotoDestaqueRfo[];
};

/** Texto narrativo por área do sistema (gerado pela IA quando configurada). */
export type AnaliseSecaoModuloRfo = {
  modulo: string;
  titulo: string;
  paragrafos: string[];
};

export type RelatorioFinalObraIaApresentacaoMeta = {
  utilizada: boolean;
  modelo?: string;
  erro?: string;
  notaAnalise?: string;
};

export type RelatorioFinalObraApresentacao = {
  sintese: SinteseExecutivaRfo;
  /** Parágrafos por módulo (RNC, recebimentos, RIR, etc.) — preenchido pela IA. */
  secoesModulo?: AnaliseSecaoModuloRfo[];
  rirCertificados: ResumoRirCertificados;
  rfDestaques: RelatorioFotograficoDestaqueRfo[];
  ia?: RelatorioFinalObraIaApresentacaoMeta;
};
