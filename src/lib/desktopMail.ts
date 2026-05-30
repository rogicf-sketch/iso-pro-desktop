import type { ConfiguracaoSistema } from '../modules/configuracoes/types/configuracao.types';

export type DesktopMailPayload = {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

export function isDesktopMailDisponivel(): boolean {
  return typeof window !== 'undefined' && window.isoProDesktop?.platform === 'desktop' && Boolean(window.isoProDesktop.sendMail);
}

/** Texto curto para diagnosticar por que o teste SMTP local esta indisponivel. */
export function motivoDesktopMailIndisponivel(): string {
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;
  if (!api) {
    return 'Nenhuma API desktop detectada — abra pelo icone do Windows (Setup .exe), nao pelo site no navegador.';
  }
  if (api.platform !== 'desktop') {
    return `Plataforma "${String(api.platform)}" — use o aplicativo instalado no PC.`;
  }
  if (!api.sendMail) {
    return `Instalacao desktop (v${api.version ?? '?'}) sem modulo de e-mail — reinstale o Setup 0.1.16 ou superior.`;
  }
  return '';
}

export function parseDestinatariosEmail(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.includes('@'));
}

export function montarSmtpDeConfig(config: Pick<
  ConfiguracaoSistema,
  'smtpHost' | 'smtpPort' | 'smtpSecure' | 'smtpUsuario' | 'smtpSenha' | 'smtpRemetente'
>): DesktopMailPayload['smtp'] & { from: string } {
  return {
    host: config.smtpHost.trim(),
    port: config.smtpPort > 0 ? config.smtpPort : 587,
    secure: config.smtpSecure === true,
    user: config.smtpUsuario.trim(),
    pass: config.smtpSenha,
    from: config.smtpRemetente.trim(),
  };
}

export function configEmailEstoquePronta(config: Pick<
  ConfiguracaoSistema,
  | 'alertaEstoqueEmailHabilitado'
  | 'alertaEstoqueEmailDestinatarios'
  | 'smtpHost'
  | 'smtpPort'
  | 'smtpRemetente'
>): boolean {
  if (!config.alertaEstoqueEmailHabilitado) return false;
  if (!config.smtpHost.trim() || !config.smtpRemetente.trim()) return false;
  if (parseDestinatariosEmail(config.alertaEstoqueEmailDestinatarios).length === 0) return false;
  return true;
}

export async function enviarEmailDesktop(payload: DesktopMailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = window.isoProDesktop?.sendMail;
  if (!api) {
    return { ok: false, error: 'Envio de e-mail disponivel apenas no aplicativo desktop (Electron).' };
  }
  return api(payload);
}

export async function verificarSmtpDesktop(payload: DesktopMailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = window.isoProDesktop?.verifySmtpMail;
  if (!api) {
    return { ok: false, error: 'Teste SMTP disponivel apenas no aplicativo desktop (Electron).' };
  }
  return api(payload);
}
