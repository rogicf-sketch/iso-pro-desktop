import { getActiveTenantId } from './isoProTenant';
import { getSupabase, resetSupabaseClient } from './supabase';

const JWT_SESSION_FLAG_KEY = 'iso-pro-jwt-session-active-v1';

export type IsoProJwtBootstrapResult =
  | { ok: true; email: string; authUserId: string }
  | { ok: false; jwtReady: false; reason: string }
  | { ok: false; jwtReady: true; reason: string };

export type JwtBootstrapOutcome =
  | { kind: 'skipped' }
  | { kind: 'ok' }
  | { kind: 'mfa_required'; factorId: string }
  | { kind: 'failed'; reason: string };

function isJwtAuthFeatureEnabled(): boolean {
  const envFlag = String(import.meta.env.VITE_ISO_PRO_JWT_AUTH ?? '').trim().toLowerCase();
  if (envFlag === 'true' || envFlag === '1' || envFlag === 'yes') return true;
  if (envFlag === 'false' || envFlag === '0' || envFlag === 'no') return false;
  try {
    const stored = localStorage.getItem('iso-pro-desktop-jwt-auth-opt-in-v1');
    if (stored === '0' || stored === 'false' || stored === 'no') return false;
    return true;
  } catch {
    return true;
  }
}

export function isIsoProJwtSessionActive(): boolean {
  try {
    return localStorage.getItem(JWT_SESSION_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setJwtSessionActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(JWT_SESSION_FLAG_KEY, '1');
    } else {
      localStorage.removeItem(JWT_SESSION_FLAG_KEY);
    }
  } catch {
    /* ignore */
  }
  resetSupabaseClient();
}

export async function resolverAuthEmailSessao(
  login: string,
  senha: string,
): Promise<IsoProJwtBootstrapResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, jwtReady: false, reason: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_resolver_auth_email_sessao', {
    p_tenant_id: getActiveTenantId(),
    p_login: login.trim().toLowerCase(),
    p_senha: senha.trim(),
  });

  if (error) {
    const msg = error.message ?? 'Falha ao resolver email Auth.';
    const missing = /could not find the function|does not exist/i.test(msg);
    return {
      ok: false,
      jwtReady: false,
      reason: missing
        ? 'RPC iso_pro_resolver_auth_email_sessao em falta. Aplique migration 20260706230000.'
        : msg,
    };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  if (body.ok !== true) {
    return {
      ok: false,
      jwtReady: body.jwtReady === true,
      reason: String(body.error ?? 'Sessao JWT indisponivel para este utilizador.'),
    };
  }

  const email = String(body.email ?? '').trim();
  const authUserId = String(body.authUserId ?? '').trim();
  if (!email || !authUserId) {
    return { ok: false, jwtReady: false, reason: 'Resposta Auth incompleta.' };
  }

  return { ok: true, email, authUserId };
}

async function detectMfaRequired(): Promise<{ required: true; factorId: string } | { required: false }> {
  const supabase = getSupabase();
  if (!supabase) return { required: false };

  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error || !aal.data) return { required: false };

  const needsAal2 = aal.data.nextLevel === 'aal2' && aal.data.currentLevel !== 'aal2';
  if (!needsAal2) return { required: false };

  const factors = await supabase.auth.mfa.listFactors();
  const totp = (factors.data?.totp ?? []).find((f) => f.status === 'verified');
  if (!totp?.id) return { required: false };
  return { required: true, factorId: totp.id };
}

/**
 * Após login RPC bem-sucedido: tenta signInWithPassword se utilizador tem auth_user_id ligado.
 * Se MFA TOTP estiver activo, devolve `mfa_required` (sessão Auth aal1 até verificar o código).
 */
export async function tryBootstrapJwtSessionAfterLogin(
  login: string,
  senha: string,
): Promise<JwtBootstrapOutcome> {
  if (!isJwtAuthFeatureEnabled()) return { kind: 'skipped' };

  const resolved = await resolverAuthEmailSessao(login, senha);
  if (!resolved.ok) return { kind: 'skipped' };

  setJwtSessionActive(true);
  const supabase = getSupabase();
  if (!supabase) {
    setJwtSessionActive(false);
    return { kind: 'failed', reason: 'Supabase nao configurado.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password: senha.trim(),
  });

  if (error) {
    setJwtSessionActive(false);
    console.warn('[I.S.O PRO] JWT bootstrap falhou; modo anon mantido:', error.message);
    return { kind: 'failed', reason: error.message };
  }

  const mfa = await detectMfaRequired();
  if (mfa.required) {
    return { kind: 'mfa_required', factorId: mfa.factorId };
  }

  return { kind: 'ok' };
}

export async function clearIsoProJwtSession(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  setJwtSessionActive(false);
}

export function setIsoProJwtAuthOptIn(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem('iso-pro-desktop-jwt-auth-opt-in-v1', '1');
    } else {
      localStorage.setItem('iso-pro-desktop-jwt-auth-opt-in-v1', '0');
    }
  } catch {
    /* ignore */
  }
}

export function isIsoProJwtAuthOptIn(): boolean {
  return isJwtAuthFeatureEnabled();
}
