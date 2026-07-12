export type AtendimentoComandoOrigem = 'mobile' | 'pc' | 'reconciliacao' | 'outro';

export type AtendimentoComandoStatus = 'ok' | 'pendente';

export type AtendimentoComandoAuditoria = {
  id: string;
  idempotencyKey: string;
  baselineUpdatedAt: string;
  snapshotUpdatedAt: string | null;
  createdAt: string;
  status: AtendimentoComandoStatus;
  historicoCount: number;
  documentosCount: number;
  atendimentosCount: number;
  estornoCount: number;
  origem: AtendimentoComandoOrigem;
};

export type MobileSyncHealthAlert = {
  deviceId: string;
  deviceLabel: string | null;
  appVersion: string;
  queueSize: number;
  reportedAt: string;
};

export type MobileSyncHealthResumo = {
  alertCount: number;
  items: MobileSyncHealthAlert[];
  source: 'supabase' | 'indisponivel';
  warning: string | null;
};

export type AtendimentoSyncAdminResumo = {
  total: number;
  pendentes: number;
  sucesso24h: number;
  items: AtendimentoComandoAuditoria[];
  source: 'supabase' | 'indisponivel';
  warning: string | null;
};

export type RlsJwtEstadoResumo = {
  ok: boolean;
  authRole: string;
  jwtAtivo: boolean;
  jwtAlinhado: boolean;
  comandosRls: boolean;
  comandosTotal: number;
  authMemberships: number;
  modo: 'jwt_forte' | 'jwt_desalinhado' | 'anon_compativel' | 'desconhecido';
  warning: string | null;
};
