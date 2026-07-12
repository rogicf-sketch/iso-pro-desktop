import {
  autenticarUsuarioIsoProRpc,
  mapIsoProAuthRpcUser,
  type IsoProAuthRpcUser,
} from './isoProAuthRpc';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase, resetSupabaseClient } from './supabase';

const JWT_SESSION_FLAG_KEY = 'iso-pro-jwt-session-active-v1';

export type IsoProAuthPath = 'jwt' | 'rpc_fallback' | 'rpc_only';

export type IsoProJwtBootstrapResult =
  | { ok: true; email: string; authUserId: string; user?: IsoProAuthRpcUser; jwtReady: true }
  | { ok: true; jwtReady: false; user?: IsoProAuthRpcUser; reason: string }
  | { ok: false; jwtReady: false; reason: string }
  | { ok: false; jwtReady: true; reason: string };

export type JwtBootstrapOutcome =
  | { kind: 'skipped' }
  | { kind: 'ok' }
  | { kind: 'mfa_required'; factorId: string }
  | { kind: 'failed'; reason: string };

export type PreferJwtLoginResult =
  | {
      ok: true;
      user: IsoProAuthRpcUser;
      authPath: IsoProAuthPath;
      jwt: JwtBootstrapOutcome;
    }
  | { ok: false; error: string; rpcMissing?: boolean };

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

function parseUserFromResolverBody(body: Record<string, unknown>): IsoProAuthRpcUser | null {
  const raw = body.user;
  if (!raw || typeof raw !== 'object') return null;
  try {
    return mapIsoProAuthRpcUser(raw as IsoProAuthRpcUser);
  } catch {
    return null;
  }
}

export async function resolverAuthEmailSessao(
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<IsoProJwtBootstrapResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, jwtReady: false, reason: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_resolver_auth_email_sessao', {
    p_tenant_id: getActiveTenantId(),
    p_login: login.trim().toLowerCase(),
    p_senha: senha.trim(),
    p_requer_modulo: options?.requiredModule ?? null,
  });

  if (error) {
    const msg = error.message ?? 'Falha ao resolver email Auth.';
    const missing = /could not find the function|does not exist/i.test(msg);
    return {
      ok: false,
      jwtReady: false,
      reason: missing
        ? 'RPC iso_pro_resolver_auth_email_sessao em falta. Aplique migration 20260712120000.'
        : msg,
    };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  const user = parseUserFromResolverBody(body);

  if (body.ok === true && body.jwtReady === true) {
    const email = String(body.email ?? '').trim();
    const authUserId = String(body.authUserId ?? '').trim();
    if (!email || !authUserId) {
      return { ok: false, jwtReady: false, reason: 'Resposta Auth incompleta.', ...(user ? { user } : {}) } as IsoProJwtBootstrapResult;
    }
    return { ok: true, jwtReady: true, email, authUserId, ...(user ? { user } : {}) };
  }

  if (body.ok === true && body.jwtReady === false && user) {
    return {
      ok: true,
      jwtReady: false,
      user,
      reason: String(body.error ?? 'Sessao JWT indisponivel para este utilizador.'),
    };
  }

  if (body.ok !== true) {
    return {
      ok: false,
      jwtReady: body.jwtReady === true,
      reason: String(body.error ?? 'Sessao JWT indisponivel para este utilizador.'),
    };
  }

  return {
    ok: false,
    jwtReady: false,
    reason: String(body.error ?? 'Sessao JWT indisponivel para este utilizador.'),
  };
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

async function signInResolvedEmail(email: string, senha: string): Promise<JwtBootstrapOutcome> {
  setJwtSessionActive(true);
  const supabase = getSupabase();
  if (!supabase) {
    setJwtSessionActive(false);
    return { kind: 'failed', reason: 'Supabase nao configurado.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
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

/**
 * Login preferindo JWT: 1 RPC resolver (autentica + email) → signIn; se sem Auth link, sessão app em anon.
 * Nunca revoga o fallback RPC. Sem cutover.
 */
export async function authenticateIsoProPreferJwt(
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<PreferJwtLoginResult> {
  if (!isJwtAuthFeatureEnabled()) {
    const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, options);
    if (!rpc.ok) return rpc;
    return { ok: true, user: rpc.user, authPath: 'rpc_only', jwt: { kind: 'skipped' } };
  }

  const resolved = await resolverAuthEmailSessao(login, senha, options);

  if (resolved.ok === true && resolved.jwtReady === true) {
    let user = resolved.user ?? null;
    if (!user) {
      const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, options);
      if (!rpc.ok) return rpc;
      user = rpc.user;
    }
    const jwt = await signInResolvedEmail(resolved.email, senha);
    if (jwt.kind === 'ok') {
      return { ok: true, user, authPath: 'jwt', jwt };
    }
    if (jwt.kind === 'mfa_required') {
      return { ok: true, user, authPath: 'jwt', jwt };
    }
    return { ok: true, user, authPath: 'rpc_fallback', jwt };
  }

  if (resolved.ok === true && resolved.jwtReady === false && resolved.user) {
    return {
      ok: true,
      user: resolved.user,
      authPath: 'rpc_only',
      jwt: { kind: 'skipped' },
    };
  }

  // Resolver em falta / formato antigo / falha: fallback autenticar directo.
  const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, options);
  if (!rpc.ok) {
    if (resolved.ok === false && !/em falta|does not exist|could not find/i.test(resolved.reason)) {
      return { ok: false, error: resolved.reason || rpc.error, rpcMissing: rpc.rpcMissing };
    }
    return rpc;
  }

  // Formato antigo: resolver ok com email mas sem user — tentar JWT na mesma.
  if (resolved.ok === true && 'email' in resolved && resolved.jwtReady === true) {
    const jwt = await signInResolvedEmail(resolved.email, senha);
    if (jwt.kind === 'ok' || jwt.kind === 'mfa_required') {
      return { ok: true, user: rpc.user, authPath: 'jwt', jwt };
    }
    return { ok: true, user: rpc.user, authPath: 'rpc_fallback', jwt };
  }

  return { ok: true, user: rpc.user, authPath: 'rpc_only', jwt: { kind: 'skipped' } };
}

/**
 * Após login RPC bem-sucedido (legado): tenta signInWithPassword se utilizador tem auth_user_id.
 */
export async function tryBootstrapJwtSessionAfterLogin(
  login: string,
  senha: string,
): Promise<JwtBootstrapOutcome> {
  if (!isJwtAuthFeatureEnabled()) return { kind: 'skipped' };

  const resolved = await resolverAuthEmailSessao(login, senha);
  if (!(resolved.ok === true && resolved.jwtReady === true)) return { kind: 'skipped' };

  return signInResolvedEmail(resolved.email, senha);
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
