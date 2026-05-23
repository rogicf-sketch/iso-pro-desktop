import nodemailer from 'npm:nodemailer@6.9.16';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export async function enviarEmailSmtp(
  smtp: SmtpConfig,
  to: string[],
  subject: string,
  text: string,
  html: string,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  await transport.sendMail({
    from: smtp.from,
    to: to.join(', '),
    subject,
    text,
    html,
  });
}
