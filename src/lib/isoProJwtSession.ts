import {
  autenticarUsuarioIsoProRpc,
  mapIsoProAuthRpcUser,
  type IsoProAuthRpcUser,
} from './isoProAuthRpc';
import { bumpIsoProJwtEpoch, isoProJwtEpoch } from './isoProJwtEpoch';
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
  /** Admin JWT sem TOTP verificado — obrigar registo do authenticator antes da sessão ISO PRO. */
  | { kind: 'mfa_enroll_required' }
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
  // Produção / EXE: JWT obrigatório — ignora VITE=false e opt-out em localStorage.
  if (import.meta.env.PROD) return true;
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

/** Alinha o flag local com a sessão Auth real (evita «Auth session missing» com flag stale). */
export async function syncIsoProJwtSessionFlagFromAuth(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    setJwtSessionActive(false);
    return false;
  }
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? '';
    if (!token) {
      setJwtSessionActive(false);
      return false;
    }
    const jwtTenant = tenantIdFromAccessToken(token);
    if (!jwtTenant || jwtTenant !== getActiveTenantId()) {
      await clearIsoProJwtSession();
      return false;
    }
    setJwtSessionActive(true);
    return true;
  } catch {
    setJwtSessionActive(false);
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
  // Nao resetar o cliente aqui: destruia a sessao em memoria e, com persistSession
  // a mudar de false→true, o browser podia ficar authenticated sem claim tenant
  // (Materiais/Planejamento a mostrar so o seed local DOC-1001 / EL-0102).
}

function tenantIdFromAccessToken(accessToken: string): string | null {
  try {
    const payloadB64 = accessToken.split('.')[1];
    if (!payloadB64) return null;
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = atob(padded + '='.repeat(padLen));
    const claims = JSON.parse(json) as {
      tenant_id?: string;
      app_metadata?: { tenant_id?: string };
      user_metadata?: { tenant_id?: string };
    };
    const raw =
      claims.tenant_id ?? claims.app_metadata?.tenant_id ?? claims.user_metadata?.tenant_id ?? '';
    const t = String(raw).trim();
    return t || null;
  } catch {
    return null;
  }
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

/** Admins/TI devem ter authenticator; operadores de campo não são forçados. */
export function isoProUserRequiresMfaEnroll(user: IsoProAuthRpcUser): boolean {
  const login = String(user.login ?? '').trim().toLowerCase();
  if (login === 'admin') return true;
  const perfilNome = String(user.perfil?.nome ?? '').toLowerCase();
  if (perfilNome.includes('admin')) return true;
  // Só «administrar» em Configurações/Usuários (não basta visualizar/editar operacional).
  return (user.permissoes ?? []).some(
    (p) =>
      Boolean(p.permitido) &&
      p.acao === 'administrar' &&
      (p.modulo === 'configuracoes' || p.modulo === 'usuarios'),
  );
}

async function detectMfaEnrollRequired(user: IsoProAuthRpcUser): Promise<boolean> {
  if (!isoProUserRequiresMfaEnroll(user)) return false;
  const supabase = getSupabase();
  // Sem cliente: nao libertar admin sem MFA (fail-closed).
  if (!supabase) return true;
  const factors = await supabase.auth.mfa.listFactors();
  // Erro ao listar factores: fail-closed para roles que exigem MFA.
  if (!factors || factors.error) return true;
  const totp = (factors.data?.totp ?? []).find((f) => f.status === 'verified');
  return !totp?.id;
}

async function signInResolvedEmail(email: string, senha: string): Promise<JwtBootstrapOutcome> {
  bumpIsoProJwtEpoch();
  setJwtSessionActive(true);
  const supabase = getSupabase();
  if (!supabase) {
    setJwtSessionActive(false);
    return { kind: 'failed', reason: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha.trim(),
  });

  if (error) {
    setJwtSessionActive(false);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    console.warn('[I.S.O PRO] JWT bootstrap falhou (fail-closed):', error.message);
    return { kind: 'failed', reason: error.message };
  }

  const accessToken = data.session?.access_token ?? '';
  const jwtTenant = accessToken ? tenantIdFromAccessToken(accessToken) : null;
  const activeTenant = getActiveTenantId();
  if (!jwtTenant || jwtTenant !== activeTenant) {
    console.warn('[I.S.O PRO] JWT sem tenant_id alinhado; modo anon (rpc_fallback).', {
      jwtTenant,
      activeTenant,
    });
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setJwtSessionActive(false);
    return {
      kind: 'failed',
      reason: 'JWT sem claim tenant_id (hook/membership). Continua em modo anon.',
    };
  }

  const mfa = await detectMfaRequired();
  if (mfa.required) {
    return { kind: 'mfa_required', factorId: mfa.factorId };
  }

  return { kind: 'ok' };
}

/**
 * Login preferindo JWT: 1 RPC resolver (autentica + email) → signIn.
 * Modo enterprise (default): utilizador jwt_ready sem sessão JWT → login recusado (sem rpc_fallback).
 * Utilizador sem Auth link → login recusado (sem rpc_only silencioso). Opt-out: VITE_ISO_PRO_JWT_AUTH=false.
 */
export async function authenticateIsoProPreferJwt(
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<PreferJwtLoginResult> {
  bumpIsoProJwtEpoch();
  if (!isJwtAuthFeatureEnabled()) {
    const rpc = await autenticarUsuarioIsoProRpc(getActiveTenantId(), login, senha, options);
    if (!rpc.ok) return rpc;
    return { ok: true, user: rpc.user, authPath: 'rpc_only', jwt: { kind: 'skipped' } };
  }

  // Troca de empresa no ecrã de login: JWT antigo de outro tenant bloqueava o resolver.
  const supabasePre = getSupabase();
  if (supabasePre) {
    try {
      const { data: sess } = await supabasePre.auth.getSession();
      const token = sess.session?.access_token;
      if (token) {
        const jwtTenant = tenantIdFromAccessToken(token);
        if (jwtTenant && jwtTenant !== getActiveTenantId()) {
          await clearIsoProJwtSession();
        }
      }
    } catch {
      /* ignore */
    }
  }

  const resolved = await resolverAuthEmailSessao(login, senha, options);

  if (resolved.ok === true && resolved.jwtReady === true) {
    const user = resolved.user;
    if (!user) {
      return {
        ok: false,
        error:
          'Conta Auth ligada, mas sem perfil ISO PRO na resposta. Contacte o administrador (membership / perfil).',
      };
    }
    const jwt = await signInResolvedEmail(resolved.email, senha);
    if (jwt.kind === 'ok') {
      if (await detectMfaEnrollRequired(user)) {
        return { ok: true, user, authPath: 'jwt', jwt: { kind: 'mfa_enroll_required' } };
      }
      return { ok: true, user, authPath: 'jwt', jwt };
    }
    if (jwt.kind === 'mfa_required') {
      return { ok: true, user, authPath: 'jwt', jwt };
    }
    if (jwt.kind === 'mfa_enroll_required') {
      return { ok: true, user, authPath: 'jwt', jwt };
    }
    return {
      ok: false,
      error:
        jwt.kind === 'failed'
          ? `Login JWT falhou: ${jwt.reason}. Com cutover activo nao ha fallback anon. Verifique senha Auth, hook tenant_id e MFA.`
          : 'Login JWT falhou. Com cutover activo nao ha fallback anon.',
    };
  }

  if (resolved.ok === true && resolved.jwtReady === false) {
    return {
      ok: false,
      error:
        'Utilizador sem ligacao Supabase Auth (JWT). Em Usuarios → editar → Ligar UUID Auth, ou peca ao administrador. Cutover enterprise nao permite sessao anon.',
    };
  }

  // Resolver em falta / falha de credenciais
  if (resolved.ok === false) {
    const msg = resolved.reason || 'Falha na autenticacao.';
    if (/em falta|does not exist|could not find/i.test(msg)) {
      return {
        ok: false,
        error: msg,
        rpcMissing: true,
      };
    }
    return { ok: false, error: msg };
  }

  return {
    ok: false,
    error: 'Nao foi possivel autenticar com JWT. Contacte o administrador.',
  };
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

let clearQueue: Promise<void> = Promise.resolve();

async function clearIsoProJwtSessionNow(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  setJwtSessionActive(false);
  resetSupabaseClient();
}

export function clearIsoProJwtSession(scheduledEpoch = isoProJwtEpoch()): Promise<void> {
  const run = clearQueue.then(async () => {
    if (scheduledEpoch !== isoProJwtEpoch()) return;
    await clearIsoProJwtSessionNow();
  });
  clearQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Se a sessao Auth estiver desalinhada (RLS a esconder dados), volta a anon. */
export async function ensureIsoProDataSessionReadable(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? '';
    if (!token) {
      if (isIsoProJwtSessionActive()) setJwtSessionActive(false);
      return;
    }
    const jwtTenant = tenantIdFromAccessToken(token);
    if (!jwtTenant || jwtTenant !== getActiveTenantId()) {
      await clearIsoProJwtSession();
      return;
    }
    if (!isIsoProJwtSessionActive()) setJwtSessionActive(true);
  } catch {
    await clearIsoProJwtSession();
  }
}

export function setIsoProJwtAuthOptIn(enabled: boolean): void {
  // Em produção não se desliga JWT (rpc_only proibido).
  if (import.meta.env.PROD && !enabled) return;
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
