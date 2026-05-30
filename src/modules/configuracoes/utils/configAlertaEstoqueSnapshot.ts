import type { ConfiguracaoSistema } from '../types/configuracao.types';

/** Subconjunto gravado em `iso_pro_snapshot.payload.configuracoesSistema` para alertas na nuvem. */
export type ConfigAlertaEstoqueSnapshot = {
  alertaEstoqueEmailHabilitado?: boolean;
  alertaEstoqueEmailDestinatarios?: string;
  alertaOperacionalEmailHabilitado?: boolean;
  alertaOperacionalEmailDestinatarios?: string;
  alertaOperacionalConferenciaHabilitado?: boolean;
  alertaOperacionalConferenciaPrazoDias?: number;
  alertaOperacionalRirHabilitado?: boolean;
  alertaOperacionalRirPrazoDias?: number;
  alertaOperacionalRncHabilitado?: boolean;
  alertaOperacionalRncPrazoDias?: number;
  alertaOperacionalInventarioHabilitado?: boolean;
  alertaOperacionalInventarioPrazoDias?: number;
  alertaOperacionalIntervaloMinimoHoras?: number;
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
  alertaOperacionalEmailState?: {
    lastNotifiedFingerprint: string;
    lastSentAt: string;
  };
};

export function extrairConfigAlertaEstoqueParaSnapshot(
  config: Pick<
    ConfiguracaoSistema,
    | 'alertaEstoqueEmailHabilitado'
    | 'alertaEstoqueEmailDestinatarios'
    | 'alertaOperacionalEmailHabilitado'
    | 'alertaOperacionalEmailDestinatarios'
    | 'alertaOperacionalConferenciaHabilitado'
    | 'alertaOperacionalConferenciaPrazoDias'
    | 'alertaOperacionalRirHabilitado'
    | 'alertaOperacionalRirPrazoDias'
    | 'alertaOperacionalRncHabilitado'
    | 'alertaOperacionalRncPrazoDias'
    | 'alertaOperacionalInventarioHabilitado'
    | 'alertaOperacionalInventarioPrazoDias'
    | 'alertaOperacionalIntervaloMinimoHoras'
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
    alertaOperacionalEmailHabilitado: config.alertaOperacionalEmailHabilitado === true,
    alertaOperacionalEmailDestinatarios: config.alertaOperacionalEmailDestinatarios.trim(),
    alertaOperacionalConferenciaHabilitado: config.alertaOperacionalConferenciaHabilitado !== false,
    alertaOperacionalConferenciaPrazoDias:
      config.alertaOperacionalConferenciaPrazoDias > 0 ? config.alertaOperacionalConferenciaPrazoDias : 2,
    alertaOperacionalRirHabilitado: config.alertaOperacionalRirHabilitado !== false,
    alertaOperacionalRirPrazoDias: config.alertaOperacionalRirPrazoDias > 0 ? config.alertaOperacionalRirPrazoDias : 5,
    alertaOperacionalRncHabilitado: config.alertaOperacionalRncHabilitado !== false,
    alertaOperacionalRncPrazoDias: config.alertaOperacionalRncPrazoDias > 0 ? config.alertaOperacionalRncPrazoDias : 7,
    alertaOperacionalInventarioHabilitado: config.alertaOperacionalInventarioHabilitado === true,
    alertaOperacionalInventarioPrazoDias:
      config.alertaOperacionalInventarioPrazoDias > 0 ? config.alertaOperacionalInventarioPrazoDias : 7,
    alertaOperacionalIntervaloMinimoHoras:
      config.alertaOperacionalIntervaloMinimoHoras > 0 ? config.alertaOperacionalIntervaloMinimoHoras : 24,
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
  const opStateRaw = o.alertaOperacionalEmailState;
  let alertaOperacionalEmailState: ConfigAlertaEstoqueSnapshot['alertaOperacionalEmailState'];
  if (opStateRaw && typeof opStateRaw === 'object' && !Array.isArray(opStateRaw)) {
    const s = opStateRaw as Record<string, unknown>;
    alertaOperacionalEmailState = {
      lastNotifiedFingerprint: String(s.lastNotifiedFingerprint ?? ''),
      lastSentAt: String(s.lastSentAt ?? ''),
    };
  }
  return {
    alertaEstoqueEmailHabilitado: o.alertaEstoqueEmailHabilitado === true,
    alertaEstoqueEmailDestinatarios: String(o.alertaEstoqueEmailDestinatarios ?? '').trim(),
    alertaOperacionalEmailHabilitado: o.alertaOperacionalEmailHabilitado === true,
    alertaOperacionalEmailDestinatarios: String(o.alertaOperacionalEmailDestinatarios ?? '').trim(),
    alertaOperacionalConferenciaHabilitado: o.alertaOperacionalConferenciaHabilitado !== false,
    alertaOperacionalConferenciaPrazoDias:
      Number.isFinite(Number(o.alertaOperacionalConferenciaPrazoDias)) && Number(o.alertaOperacionalConferenciaPrazoDias) > 0
        ? Number(o.alertaOperacionalConferenciaPrazoDias)
        : 2,
    alertaOperacionalRirHabilitado: o.alertaOperacionalRirHabilitado !== false,
    alertaOperacionalRirPrazoDias:
      Number.isFinite(Number(o.alertaOperacionalRirPrazoDias)) && Number(o.alertaOperacionalRirPrazoDias) > 0
        ? Number(o.alertaOperacionalRirPrazoDias)
        : 5,
    alertaOperacionalRncHabilitado: o.alertaOperacionalRncHabilitado !== false,
    alertaOperacionalRncPrazoDias:
      Number.isFinite(Number(o.alertaOperacionalRncPrazoDias)) && Number(o.alertaOperacionalRncPrazoDias) > 0
        ? Number(o.alertaOperacionalRncPrazoDias)
        : 7,
    alertaOperacionalInventarioHabilitado: o.alertaOperacionalInventarioHabilitado === true,
    alertaOperacionalInventarioPrazoDias:
      Number.isFinite(Number(o.alertaOperacionalInventarioPrazoDias)) && Number(o.alertaOperacionalInventarioPrazoDias) > 0
        ? Number(o.alertaOperacionalInventarioPrazoDias)
        : 7,
    alertaOperacionalIntervaloMinimoHoras:
      Number.isFinite(Number(o.alertaOperacionalIntervaloMinimoHoras)) && Number(o.alertaOperacionalIntervaloMinimoHoras) > 0
        ? Number(o.alertaOperacionalIntervaloMinimoHoras)
        : 24,
    smtpHost: String(o.smtpHost ?? '').trim(),
    smtpPort: Number.isFinite(Number(o.smtpPort)) && Number(o.smtpPort) > 0 ? Number(o.smtpPort) : 587,
    smtpSecure: o.smtpSecure === true,
    smtpUsuario: String(o.smtpUsuario ?? '').trim(),
    smtpSenha: String(o.smtpSenha ?? ''),
    smtpRemetente: String(o.smtpRemetente ?? '').trim(),
    cliente: String(o.cliente ?? '').trim(),
    projeto: String(o.projeto ?? '').trim(),
    alertaEstoqueEmailState,
    alertaOperacionalEmailState,
  };
}
