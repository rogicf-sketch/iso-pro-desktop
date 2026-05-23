import type { ConfiguracaoSistema } from '../types/configuracao.types';

/** Subconjunto gravado em `iso_pro_snapshot.payload.configuracoesSistema` para alertas na nuvem. */
export type ConfigAlertaEstoqueSnapshot = {
  alertaEstoqueEmailHabilitado?: boolean;
  alertaEstoqueEmailDestinatarios?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsuario?: string;
  smtpSenha?: string;
  smtpRemetente?: string;
  cliente?: string;
  projeto?: string;
  alertaEstoqueEmailState?: {
    lastNotifiedCriticalIds: string[];
    lastSentAt: string;
  };
};

export function extrairConfigAlertaEstoqueParaSnapshot(
  config: Pick<
    ConfiguracaoSistema,
    | 'alertaEstoqueEmailHabilitado'
    | 'alertaEstoqueEmailDestinatarios'
    | 'smtpHost'
    | 'smtpPort'
    | 'smtpSecure'
    | 'smtpUsuario'
    | 'smtpSenha'
    | 'smtpRemetente'
    | 'cliente'
    | 'projeto'
  >,
): ConfigAlertaEstoqueSnapshot {
  return {
    alertaEstoqueEmailHabilitado: config.alertaEstoqueEmailHabilitado === true,
    alertaEstoqueEmailDestinatarios: config.alertaEstoqueEmailDestinatarios.trim(),
    smtpHost: config.smtpHost.trim(),
    smtpPort: config.smtpPort > 0 ? config.smtpPort : 587,
    smtpSecure: config.smtpSecure === true,
    smtpUsuario: config.smtpUsuario.trim(),
    smtpSenha: config.smtpSenha,
    smtpRemetente: config.smtpRemetente.trim(),
    cliente: config.cliente.trim(),
    projeto: config.projeto.trim(),
  };
}

export function lerConfigAlertaEstoqueDoSnapshot(raw: unknown): ConfigAlertaEstoqueSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const stateRaw = o.alertaEstoqueEmailState;
  let alertaEstoqueEmailState: ConfigAlertaEstoqueSnapshot['alertaEstoqueEmailState'];
  if (stateRaw && typeof stateRaw === 'object' && !Array.isArray(stateRaw)) {
    const s = stateRaw as Record<string, unknown>;
    alertaEstoqueEmailState = {
      lastNotifiedCriticalIds: Array.isArray(s.lastNotifiedCriticalIds)
        ? s.lastNotifiedCriticalIds.map(String)
        : [],
      lastSentAt: String(s.lastSentAt ?? ''),
    };
  }
  return {
    alertaEstoqueEmailHabilitado: o.alertaEstoqueEmailHabilitado === true,
    alertaEstoqueEmailDestinatarios: String(o.alertaEstoqueEmailDestinatarios ?? '').trim(),
    smtpHost: String(o.smtpHost ?? '').trim(),
    smtpPort: Number.isFinite(Number(o.smtpPort)) && Number(o.smtpPort) > 0 ? Number(o.smtpPort) : 587,
    smtpSecure: o.smtpSecure === true,
    smtpUsuario: String(o.smtpUsuario ?? '').trim(),
    smtpSenha: String(o.smtpSenha ?? ''),
    smtpRemetente: String(o.smtpRemetente ?? '').trim(),
    cliente: String(o.cliente ?? '').trim(),
    projeto: String(o.projeto ?? '').trim(),
    alertaEstoqueEmailState,
  };
}
