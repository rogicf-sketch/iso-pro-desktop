import { getSupabase } from './supabase';
import { isIsoProJwtSessionActive } from './isoProJwtSession';
import { appendAuthAuditEvent } from '../modules/auth/services/authAudit.service';

export type IsoProMfaFactor = {
  id: string;
  friendlyName: string;
  status: string;
  factorType: string;
};

export type IsoProMfaEnrollStart = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

function requireJwtSupabase() {
  if (!isIsoProJwtSessionActive()) {
    throw new Error('MFA exige sessao JWT. Faca logout e login com utilizador ligado ao Supabase Auth.');
  }
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }
  return supabase;
}

export async function listIsoProMfaFactors(): Promise<IsoProMfaFactor[]> {
  const supabase = requireJwtSupabase();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const all = [...(data?.totp ?? []), ...(data?.phone ?? [])];
  return all.map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? f.factor_type,
    status: f.status,
    factorType: f.factor_type,
  }));
}

export async function startIsoProMfaTotpEnroll(friendlyName = 'I.S.O PRO'): Promise<IsoProMfaEnrollStart> {
  const supabase = requireJwtSupabase();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error) throw new Error(traduzirErroMfa(error.message));
  const totp = data.totp;
  if (!data.id || !totp?.qr_code || !totp.secret) {
    throw new Error('Resposta MFA incompleta do Supabase Auth.');
  }
  return {
    factorId: data.id,
    qrCode: totp.qr_code,
    secret: totp.secret,
    uri: totp.uri ?? '',
  };
}

/**
 * Para o login: remove factores TOTP ainda não verificados (tentativas a meio)
 * e inicia um enroll novo com nome único.
 */
export async function startIsoProMfaTotpEnrollForLogin(friendlyName = 'I.S.O PRO'): Promise<IsoProMfaEnrollStart> {
  const existentes = await listIsoProMfaFactors();
  const verificados = existentes.filter((f) => f.status === 'verified' && f.factorType === 'totp');
  if (verificados.length > 0) {
    throw new Error('Esta conta ja tem authenticator activo. Volte e introduza o codigo de 6 digitos.');
  }
  for (const f of existentes.filter((x) => x.status !== 'verified')) {
    try {
      await unenrollIsoProMfaFactor(f.id);
    } catch {
      /* ignora — tenta enroll na mesma */
    }
  }
  const nomeUnico = `${friendlyName} · ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
  return startIsoProMfaTotpEnroll(nomeUnico);
}

function traduzirErroMfa(message: string): string {
  if (/friendly name.*already exists/i.test(message)) {
    return 'Ja existe um authenticator a meio nesta conta. Tente novamente — o sistema limpa o registo incompleto.';
  }
  if (/invalid totp code/i.test(message)) {
    return 'Codigo MFA invalido. Confirme que escaneou o QR desta empresa (nao o de outra) e que o codigo ainda nao expirou.';
  }
  return message;
}

/** Email Auth da sessao JWT actual (para mostrar no enroll MFA). */
export async function getIsoProAuthSessionEmail(): Promise<string | null> {
  const supabase = requireJwtSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  const email = String(data.user?.email ?? '').trim();
  return email || null;
}

export async function verifyIsoProMfaTotpEnroll(factorId: string, code: string): Promise<void> {
  await verifyIsoProMfaChallenge(factorId, code);
}

/** Challenge + verify TOTP (enroll ou login AAL2). */
export async function verifyIsoProMfaChallenge(factorId: string, code: string): Promise<void> {
  const supabase = requireJwtSupabase();
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw new Error(traduzirErroMfa(challenge.error.message));
  const challengeId = challenge.data.id;
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: code.trim(),
  });
  if (verify.error) throw new Error(traduzirErroMfa(verify.error.message));
}

export async function unenrollIsoProMfaFactor(factorId: string): Promise<void> {
  const supabase = requireJwtSupabase();
  const { data, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw new Error(listError.message);
  const verified = [...(data?.totp ?? []), ...(data?.phone ?? [])].filter((f) => f.status === 'verified');
  if (verified.length <= 1 && verified.some((f) => f.id === factorId)) {
    const email = String((await supabase.auth.getUser()).data.user?.email ?? '').trim() || 'desconhecido';
    appendAuthAuditEvent({
      type: 'mfa_unenroll_blocked',
      actorLogin: email,
      detail: 'Tentativa de remover o ultimo authenticator MFA verificado (bloqueada).',
      entityType: 'mfa_factor',
      entityId: factorId,
    });
    throw new Error(
      'Nao e permitido remover o ultimo authenticator verificado. Adicione outro factor antes, ou contacte TI.',
    );
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
