import { createRequire } from 'node:module';
import { ipcMain } from 'electron';

/** nodemailer é CJS; import ESM no main Electron falha com «Dynamic require of "events"». */
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');

export type DesktopMailSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export type DesktopMailSendPayload = {
  smtp: DesktopMailSmtpConfig;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

function criarTransport(smtp: DesktopMailSmtpConfig) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}

function validarPayload(payload: unknown): DesktopMailSendPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<DesktopMailSendPayload>;
  const smtp = p.smtp;
  if (!smtp || typeof smtp !== 'object') return null;
  const host = String(smtp.host ?? '').trim();
  const port = Number(smtp.port);
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  const to = Array.isArray(p.to) ? p.to.map((x) => String(x).trim()).filter(Boolean) : [];
  if (to.length === 0) return null;
  const from = String(p.from ?? '').trim();
  const subject = String(p.subject ?? '').trim();
  const text = String(p.text ?? '');
  const html = String(p.html ?? '');
  if (!from || !subject) return null;
  return {
    smtp: {
      host,
      port,
      secure: smtp.secure === true,
      user: String(smtp.user ?? '').trim(),
      pass: String(smtp.pass ?? ''),
    },
    from,
    to,
    subject,
    text,
    html,
  };
}

export function registerMailHandlers() {
  ipcMain.handle('desktop-mail:verify-smtp', async (_event, payload: unknown) => {
    const parsed = validarPayload(payload);
    if (!parsed) {
      return { ok: false as const, error: 'Configuracao SMTP ou destinatarios invalidos.' };
    }
    try {
      const transport = criarTransport(parsed.smtp);
      await transport.verify();
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Falha ao verificar SMTP.' };
    }
  });

  ipcMain.handle('desktop-mail:send', async (_event, payload: unknown) => {
    const parsed = validarPayload(payload);
    if (!parsed) {
      return { ok: false as const, error: 'Dados do e-mail invalidos.' };
    }
    try {
      const transport = criarTransport(parsed.smtp);
      await transport.sendMail({
        from: parsed.from,
        to: parsed.to.join(', '),
        subject: parsed.subject,
        text: parsed.text,
        html: parsed.html,
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Falha ao enviar e-mail.' };
    }
  });
}
