import { getSupabase } from './supabase';
import { isIsoProJwtSessionActive } from './isoProJwtSession';

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
  if (error) throw new Error(error.message);
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

export async function verifyIsoProMfaTotpEnroll(factorId: string, code: string): Promise<void> {
  await verifyIsoProMfaChallenge(factorId, code);
}

/** Challenge + verify TOTP (enroll ou login AAL2). */
export async function verifyIsoProMfaChallenge(factorId: string, code: string): Promise<void> {
  const supabase = requireJwtSupabase();
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw new Error(challenge.error.message);
  const challengeId = challenge.data.id;
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: code.trim(),
  });
  if (verify.error) throw new Error(verify.error.message);
}

export async function unenrollIsoProMfaFactor(factorId: string): Promise<void> {
  const supabase = requireJwtSupabase();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
