export type AtendimentoIntegridadeSeveridade = 'critico' | 'alerta' | 'info';

export type AtendimentoIntegridadeAchado = {
  severidade: AtendimentoIntegridadeSeveridade;
  codigo: string;
  titulo: string;
  detalhe: string;
  documentoNumero?: string;
  documentoRevisao?: string;
  codigoMaterial?: string;
  loteNumeros?: string[];
  recebedores?: string[];
  valorNumerico?: number;
  valorEsperado?: number;
};

export type AtendimentoIntegridadeResumo = {
  criticos: number;
  alertas: number;
  infos: number;
  documentosAuditados: number;
  lotesConcluidos: number;
  linhasPlanejamento: number;
};

export type AtendimentoIntegridadeRelatorio = {
  geradoEm: string;
  snapshotUpdatedAt: string | null;
  resumo: AtendimentoIntegridadeResumo;
  achados: AtendimentoIntegridadeAchado[];
  source: 'supabase' | 'local' | 'indisponivel';
  warning: string | null;
};
