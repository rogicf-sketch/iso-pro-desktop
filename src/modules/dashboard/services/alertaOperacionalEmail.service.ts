import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { collectAllPages } from '../../../lib/collectAllPages';
import {
  configEmailOperacionalPronta,
  enviarEmailDesktop,
  isDesktopMailDisponivel,
  montarSmtpDeConfig,
  parseDestinatariosEmail,
} from '../../../lib/desktopMail';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { ConfiguracaoSistema } from '../../configuracoes/types/configuracao.types';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import {
  deveEnviarAlertaOperacional,
  montarAlertaOperacionalRelatorio,
  montarAssuntoAlertaOperacional,
  montarCorpoHtmlAlertaOperacional,
  montarCorpoTextoAlertaOperacional,
  montarFingerprintAlertaOperacional,
  totalItensAlertaOperacional,
  type AlertaOperacionalEmailState,
  type AlertaOperacionalParametros,
} from '../utils/alertaOperacional.utils';

function stateStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-alerta-operacional-email-state-v1');
}

export function readAlertaOperacionalEmailState(): AlertaOperacionalEmailState {
  if (typeof localStorage === 'undefined') {
    return { lastNotifiedFingerprint: '', lastSentAt: '' };
  }
  try {
    const raw = localStorage.getItem(stateStorageKey());
    if (!raw) return { lastNotifiedFingerprint: '', lastSentAt: '' };
    const parsed = JSON.parse(raw) as Partial<AlertaOperacionalEmailState>;
    return {
      lastNotifiedFingerprint: String(parsed.lastNotifiedFingerprint ?? ''),
      lastSentAt: String(parsed.lastSentAt ?? ''),
    };
  } catch {
    return { lastNotifiedFingerprint: '', lastSentAt: '' };
  }
}

export function writeAlertaOperacionalEmailState(state: AlertaOperacionalEmailState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(stateStorageKey(), JSON.stringify(state));
}

export function extrairParametrosAlertaOperacional(config: ConfiguracaoSistema): AlertaOperacionalParametros {
  return {
    conferenciaHabilitado: config.alertaOperacionalConferenciaHabilitado === true,
    conferenciaPrazoDias: config.alertaOperacionalConferenciaPrazoDias > 0 ? config.alertaOperacionalConferenciaPrazoDias : 2,
    rirHabilitado: config.alertaOperacionalRirHabilitado === true,
    rirPrazoDias: config.alertaOperacionalRirPrazoDias > 0 ? config.alertaOperacionalRirPrazoDias : 5,
    rncHabilitado: config.alertaOperacionalRncHabilitado === true,
    rncPrazoDias: config.alertaOperacionalRncPrazoDias > 0 ? config.alertaOperacionalRncPrazoDias : 7,
    inventarioHabilitado: config.alertaOperacionalInventarioHabilitado === true,
    inventarioPrazoDias: config.alertaOperacionalInventarioPrazoDias > 0 ? config.alertaOperacionalInventarioPrazoDias : 7,
    intervaloMinimoHoras:
      config.alertaOperacionalIntervaloMinimoHoras > 0 ? config.alertaOperacionalIntervaloMinimoHoras : 24,
  };
}

export async function carregarRelatorioAlertaOperacional(ref: Date = new Date()) {
  const config = readConfiguracoes();
  const params = extrairParametrosAlertaOperacional(config);
  const [recebimentos, rir, rnc, inventarios] = await Promise.all([
    collectAllPages((page, pageSize) =>
      listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize }),
    ),
    collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
  ]);
  return montarAlertaOperacionalRelatorio({ recebimentos, rir, rnc, inventarios, params, ref });
}

export async function processarAlertaOperacionalEmailAutomatico(): Promise<void> {
  if (!isDesktopMailDisponivel()) return;

  const config = readConfiguracoes();
  if (!configEmailOperacionalPronta(config)) return;

  const params = extrairParametrosAlertaOperacional(config);
  const relatorio = await carregarRelatorioAlertaOperacional();
  const total = totalItensAlertaOperacional(relatorio);
  const state = readAlertaOperacionalEmailState();
  const fingerprint = montarFingerprintAlertaOperacional(relatorio);

  if (total === 0) {
    if (state.lastNotifiedFingerprint) {
      writeAlertaOperacionalEmailState({ lastNotifiedFingerprint: '', lastSentAt: state.lastSentAt });
    }
    return;
  }

  if (!deveEnviarAlertaOperacional(fingerprint, state, params.intervaloMinimoHoras, total > 0)) return;

  const smtp = montarSmtpDeConfig(config);
  const destinatarios = parseDestinatariosEmail(config.alertaOperacionalEmailDestinatarios);
  const contexto = { cliente: config.cliente, projeto: config.projeto };
  const payload = {
    smtp: {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      pass: smtp.pass,
    },
    from: smtp.from,
    to: destinatarios,
    subject: montarAssuntoAlertaOperacional(total, config.projeto),
    text: montarCorpoTextoAlertaOperacional(relatorio, contexto),
    html: montarCorpoHtmlAlertaOperacional(relatorio, contexto),
  };

  const result = await enviarEmailDesktop(payload);
  if (!result.ok) return;

  writeAlertaOperacionalEmailState({
    lastNotifiedFingerprint: fingerprint,
    lastSentAt: new Date().toISOString(),
  });
}
