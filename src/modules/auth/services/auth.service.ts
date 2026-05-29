import { isElectronApp } from '../../../lib/isElectronApp';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { getSupabase, hasSupabaseConfig, resetSupabaseClient } from '../../../lib/supabase';
import { hashPassword, isPasswordHash, verifyPassword } from 'iso-pro-shared';
import { parseAuthSessionUser, parseAuthUsersStorageList } from '../schemas/authLocal.zod';
import type { AppModule, AuthUser, LoginPayload, Permission, PermissionAction } from '../types/auth.types';
import { appendAuthAuditEvent } from './authAudit.service';

export const AUTH_SESSION_STORAGE_KEY_BASE = 'iso-pro-desktop-session';
export const AUTH_USERS_STORAGE_KEY_BASE = 'iso-pro-desktop-usuarios-sistema';
/** Preferência da caixa «Permanecer logado» no ecrã de entrada (não é a sessão em si). */
export const AUTH_REMEMBER_LOGIN_PREFERENCE_KEY_BASE = 'iso-pro-auth-permanecer-logado';
export const AUTH_SESSION_LAST_ACTIVITY_KEY_BASE = 'iso-pro-auth-last-activity';
/** Mesmo com «permanecer logado», a sessão expira após este tempo sem uso (ms). */
export const AUTH_SESSION_MAX_IDLE_MS = 8 * 60 * 60 * 1000;

export function getAuthSessionStorageKey(): string {
  return getScopedIsoProStorageKey(AUTH_SESSION_STORAGE_KEY_BASE);
}

export function getAuthRememberLoginPreferenceKey(): string {
  return getScopedIsoProStorageKey(AUTH_REMEMBER_LOGIN_PREFERENCE_KEY_BASE);
}

function getAuthLastActivityKey(): string {
  return getScopedIsoProStorageKey(AUTH_SESSION_LAST_ACTIVITY_KEY_BASE);
}

function clearAuthLastActivity(): void {
  if (typeof window === 'undefined') return;
  const key = getAuthLastActivityKey();
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}

/** Regista actividade do utilizador para o limite de inatividade (8 h). */
export function touchAuthSessionActivity(): void {
  const backend = getActiveAuthSessionStorage();
  if (!backend) return;
  backend.setItem(getAuthLastActivityKey(), String(Date.now()));
}

function ensureAuthActivityTimestamp(): void {
  const backend = getActiveAuthSessionStorage();
  if (!backend) return;
  const key = getAuthLastActivityKey();
  if (!backend.getItem(key)) {
    backend.setItem(key, String(Date.now()));
  }
}

function isAuthSessionIdleExpired(): boolean {
  const backend = getActiveAuthSessionStorage();
  if (!backend) return false;
  const raw = backend.getItem(getAuthLastActivityKey());
  if (!raw) return false;
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last > AUTH_SESSION_MAX_IDLE_MS;
}

function invalidateSessionForIdle(actorLogin: string): void {
  appendAuthAuditEvent({
    type: 'session_invalidated',
    actorLogin,
    detail: 'Sessao terminada por inatividade (limite de 8 horas sem uso).',
  });
  clearAuthSessionStorage();
  clearVolatileSessionPassword();
}

function readAuthSessionRaw(): string | null {
  if (typeof window === 'undefined') return null;
  const key = getAuthSessionStorageKey();
  return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
}

/** Onde a sessão activa foi gravada (sessionStorage = só até fechar o browser/tab). */
export function getActiveAuthSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  const key = getAuthSessionStorageKey();
  if (window.sessionStorage.getItem(key)) return window.sessionStorage;
  if (window.localStorage.getItem(key)) return window.localStorage;
  return null;
}

export function clearAuthSessionStorage(): void {
  if (typeof window === 'undefined') return;
  const key = getAuthSessionStorageKey();
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
  clearAuthLastActivity();
}

export function persistAuthSession(user: AuthUser, permanecerLogado: boolean): void {
  const key = getAuthSessionStorageKey();
  const payload = JSON.stringify(user);
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
  const backend = permanecerLogado ? window.localStorage : window.sessionStorage;
  backend.setItem(key, payload);
  try {
    window.localStorage.setItem(getAuthRememberLoginPreferenceKey(), permanecerLogado ? '1' : '0');
  } catch {
    /* quota ou modo privado */
  }
  touchAuthSessionActivity();
}

/** Por omissão: web desmarcado; app desktop (Electron) marcado. */
export function readRememberLoginDefault(): boolean {
  return isElectronApp();
}

/** Última escolha da caixa «Permanecer logado», ou omissão conforme web vs desktop. */
export function readRememberLoginPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(getAuthRememberLoginPreferenceKey());
    if (raw === '1') return true;
    if (raw === '0') return false;
    return readRememberLoginDefault();
  } catch {
    return readRememberLoginDefault();
  }
}

export function getAuthUsersStorageKey(): string {
  return getScopedIsoProStorageKey(AUTH_USERS_STORAGE_KEY_BASE);
}

/** Senha do ultimo login bem-sucedido (só memória; usada como actor na Edge `iso_pro_admin_user`). */
let volatileSessionPassword: string | null = null;

export function setVolatileSessionPasswordAfterSuccessfulLogin(senha: string): void {
  volatileSessionPassword = senha.trim() || null;
}

export function getVolatileSessionPassword(): string | null {
  return volatileSessionPassword;
}

export function clearVolatileSessionPassword(): void {
  volatileSessionPassword = null;
}

/** Quem está em sessão alterou a própria senha na nuvem — manter actor alinhado ao RPC. */
export function refreshVolatileSessionPasswordAfterSelfPasswordChange(newSenha: string): void {
  const u = getCurrentUser();
  if (!u) return;
  const t = newSenha.trim();
  if (t) volatileSessionPassword = t;
}

/** Evita falha silenciosa no Windows quando .env tem CRLF (`"true\r"`). */
function isTruthyEnv(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

const ALL_MODULES: AppModule[] = [
  'dashboard',
  'fornecedores',
  'colaboradores',
  'materiais',
  'documentos',
  'recebimentos',
  'conferencia',
  'etiquetas',
  'equipamentos',
  'configuracoes',
  'atendimento',
  'inventario',
  'rir',
  'rnc',
  'relatorios',
  'mobile',
  'usuarios',
];

function buildPermissions(allowedModules: AppModule[]): Permission[] {
  return ALL_MODULES.flatMap((modulo) => [
    { modulo, acao: 'visualizar' as const, permitido: allowedModules.includes(modulo) },
    { modulo, acao: 'editar' as const, permitido: allowedModules.includes(modulo) },
    { modulo, acao: 'administrar' as const, permitido: allowedModules.includes(modulo) },
  ]);
}

const mockUsers: Record<string, AuthUser & { senha: string }> = {
  admin: {
    id: 'local-admin',
    login: 'admin',
    senha: 'admin',
    nome: 'Administrador',
    perfil: { id: 'admin', nome: 'Administrador' },
    permissoes: buildPermissions(ALL_MODULES),
  },
  planejamento: {
    id: 'local-planejamento',
    login: 'planejamento',
    senha: '1234',
    nome: 'Planejamento',
    perfil: { id: 'planejamento', nome: 'Planejamento' },
    permissoes: buildPermissions(['dashboard', 'fornecedores', 'colaboradores', 'documentos', 'materiais', 'etiquetas', 'equipamentos', 'relatorios']),
  },
  operacao: {
    id: 'local-operacao',
    login: 'operacao',
    senha: '1234',
    nome: 'Operacao',
    perfil: { id: 'operacao', nome: 'Operacao' },
    permissoes: buildPermissions(['dashboard', 'recebimentos', 'conferencia', 'etiquetas', 'equipamentos', 'atendimento', 'inventario', 'rir', 'rnc', 'mobile']),
  },
  consulta: {
    id: 'local-consulta',
    login: 'consulta',
    senha: '1234',
    nome: 'Consulta',
    perfil: { id: 'consulta', nome: 'Consulta' },
    permissoes: buildPermissions(['dashboard', 'relatorios']),
  },
};

const mockUsersList = Object.values(mockUsers);
const mockPermissionsByProfileId = new Map(
  mockUsersList.map((user) => [
    user.perfil.id,
    user.permissoes.filter((permission) => permission.permitido).map((permission) => permission.modulo),
  ]),
);

/**
 * Utilizadores guardados antes de existir um novo modulo em `ALL_MODULES` ficam sem linhas para esse modulo.
 * Sobrepõe as permissões gravadas ao baseline do perfil (seed) para novos modulos herdarem o acesso esperado.
 */
function mergePermissoesComDefaultsPerfil(stored: Permission[], perfilId: string): Permission[] {
  const baseline = buildPermissions(mockPermissionsByProfileId.get(perfilId) ?? []);
  const storedMap = new Map(stored.map((p) => [`${p.modulo}:${p.acao}`, p.permitido]));
  return baseline.map((p) => {
    const key = `${p.modulo}:${p.acao}`;
    if (storedMap.has(key)) {
      return { ...p, permitido: storedMap.get(key)! };
    }
    return p;
  });
}

/** Usuarios embutidos (admin/planejamento etc.) so em dev ou com VITE_ENABLE_LOCAL_MOCK_AUTH=true — evita build de producao com credenciais conhecidas. */
export function isLocalMockAuthSeedEnabled() {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_MOCK_AUTH === 'true';
}

function localMockUsersFallbackList(): Array<AuthUser & { senha: string }> {
  return isLocalMockAuthSeedEnabled() ? mockUsersList : [];
}

function localMockUserByLogin(login: string): (AuthUser & { senha: string }) | undefined {
  if (!isLocalMockAuthSeedEnabled()) return undefined;
  const key = login.trim().toLowerCase();
  return mockUsers[key];
}

/** Utilizador mock embutido mesmo quando existe lista em `AUTH_USERS_STORAGE_KEY_BASE` sem estes IDs. */
function resolveEmbeddedLocalMockUser(user: AuthUser): (AuthUser & { senha: string }) | undefined {
  const fromList = readLocalUsers().find((item) => item.id === user.id || item.login === user.login);
  if (fromList) return fromList;
  return localMockUserByLogin(user.login);
}

type RemotePermissionRow = {
  modulo?: string | null;
  acao?: string | null;
  permitido?: boolean | null;
};

type RemoteProfileRow = {
  id?: string | null;
  nome?: string | null;
  codigo?: string | null;
  perfil_permissoes?: RemotePermissionRow[] | null;
};

type RemoteUserRow = {
  id?: string | null;
  login?: string | null;
  nome?: string | null;
  senha?: string | null;
  ativo?: boolean | null;
  perfis_acesso?: RemoteProfileRow | null;
  usuario_permissoes?: RemotePermissionRow[] | null;
};

class AuthServiceError extends Error {
  code: 'invalid_credentials' | 'remote_unavailable';

  constructor(message: string, code: 'invalid_credentials' | 'remote_unavailable') {
    super(message);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

function sanitizeUser(user: AuthUser & { senha: string }): AuthUser {
  return {
    id: user.id,
    login: user.login,
    nome: user.nome,
    perfil: user.perfil,
    permissoes: user.permissoes,
  };
}

function isAppModule(value: string): value is AppModule {
  return ALL_MODULES.includes(value as AppModule);
}

function normalizePermissionAction(value: string): PermissionAction {
  if (value === 'editar' || value === 'administrar') return value;
  return 'visualizar';
}

function readLocalUsers(): Array<AuthUser & { senha: string }> {
  const raw = localStorage.getItem(getAuthUsersStorageKey());
  if (!raw) return localMockUsersFallbackList();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return localMockUsersFallbackList();
  }

  const list = parseAuthUsersStorageList(parsed);
  if (list === null) {
    return localMockUsersFallbackList();
  }

  return list
    .filter((item) => item.ativo)
    .map((item) => ({
      id: item.id,
      login: item.login,
      nome: item.nome,
      senha: item.senha,
      perfil: { id: item.perfilId, nome: item.perfilNome },
      permissoes:
        item.permissoes && item.permissoes.length
          ? mergePermissoesComDefaultsPerfil(
              item.permissoes.map((permission) => ({
                modulo: permission.modulo as AppModule,
                acao: normalizePermissionAction(permission.acao),
                permitido: permission.permitido,
              })),
              item.perfilId,
            )
          : buildPermissions(mockPermissionsByProfileId.get(item.perfilId) ?? []),
    }));
}

function mapRemoteUser(row: RemoteUserRow): AuthUser {
  const perfil = row.perfis_acesso;
  const sourcePermissions = row.usuario_permissoes?.length ? row.usuario_permissoes : perfil?.perfil_permissoes ?? [];
  const permissoes = sourcePermissions
    .filter(
      (permissao): permissao is Required<Pick<RemotePermissionRow, 'modulo' | 'acao' | 'permitido'>> &
        RemotePermissionRow =>
        Boolean(permissao.modulo && permissao.acao && isAppModule(permissao.modulo)),
    )
    .map((permissao) => ({
      modulo: permissao.modulo as AppModule,
      acao: normalizePermissionAction(permissao.acao ?? 'visualizar'),
      permitido: Boolean(permissao.permitido),
    }));

  return {
    id: String(row.id ?? ''),
    login: String(row.login ?? ''),
    nome: String(row.nome ?? row.login ?? 'Usuario'),
    perfil: {
      id: String(perfil?.id ?? ''),
      nome: String(perfil?.nome ?? perfil?.codigo ?? 'Perfil'),
    },
    permissoes,
  };
}

async function senhaArmazenadaValida(plainSenha: string, storedSenha: string): Promise<boolean> {
  return verifyPassword(plainSenha, storedSenha);
}

/** Rehash silencioso após login com senha legada em texto plano (migração gradual). */
function rehashRemotePasswordIfLegacy(userId: string, plainSenha: string, storedSenha: string): void {
  if (isPasswordHash(storedSenha)) return;
  const supabase = getSupabase();
  if (!supabase) return;
  void (async () => {
    try {
      const hashed = await hashPassword(plainSenha);
      await supabase
        .from('usuarios_sistema')
        .update({ senha: hashed })
        .eq('id', userId)
        .eq('tenant_id', getActiveTenantId());
    } catch {
      /* migração best-effort */
    }
  })();
}

async function loginRemote(payload: LoginPayload): Promise<AuthUser> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new AuthServiceError('Supabase nao configurado.', 'remote_unavailable');
  }

  const login = payload.login.trim().toLowerCase();
  const senha = payload.senha.trim();

  const { data, error } = await supabase
    .from('usuarios_sistema')
    .select('id,login,nome,senha,ativo,perfis_acesso(id,codigo,nome,perfil_permissoes(modulo,acao,permitido)),usuario_permissoes(modulo,acao,permitido)')
    .eq('login', login)
    .eq('tenant_id', getActiveTenantId())
    .eq('ativo', true)
    .maybeSingle();

  if (error) {
    throw new AuthServiceError(error.message, 'remote_unavailable');
  }

  const user = data as RemoteUserRow | null;
  const storedSenha = String(user?.senha ?? '');
  if (!user || !(await senhaArmazenadaValida(senha, storedSenha))) {
    throw new AuthServiceError('Login ou senha invalidos.', 'invalid_credentials');
  }

  rehashRemotePasswordIfLegacy(String(user.id ?? ''), senha, storedSenha);

  const sessionUser = mapRemoteUser(user);
  setVolatileSessionPasswordAfterSuccessfulLogin(senha);
  persistAuthSession(sessionUser, payload.permanecerLogado);
  return sessionUser;
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  if (!payload.login.trim() || !payload.senha.trim()) {
    appendAuthAuditEvent({
      type: 'login_failure',
      actorLogin: payload.login.trim().toLowerCase() || 'desconhecido',
      detail: 'Tentativa de login sem informar credenciais completas.',
    });
    throw new Error('Informe login e senha.');
  }

  /** Com VITE_ENABLE_LOCAL_MOCK_AUTH=true no build, demo entra antes do Supabase (útil com .env que já tem URL/key). */
  const demoUser = localMockUserByLogin(payload.login);
  if (demoUser && (await senhaArmazenadaValida(payload.senha.trim(), demoUser.senha))) {
    const sessionUser = sanitizeUser(demoUser);
    setVolatileSessionPasswordAfterSuccessfulLogin(payload.senha.trim());
    persistAuthSession(sessionUser, payload.permanecerLogado);
    appendAuthAuditEvent({
      type: 'login_success',
      actorLogin: sessionUser.login,
      detail: `Login com perfil de demonstracao (VITE_ENABLE_LOCAL_MOCK_AUTH). Sessao ${payload.permanecerLogado ? 'persistente' : 'ate fechar o browser'}.`,
    });
    return sessionUser;
  }

  if (hasSupabaseConfig()) {
    try {
      return await loginRemote(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao autenticar no Supabase.';
      const canUseLocalFallback = error instanceof AuthServiceError && error.code === 'remote_unavailable';
      if (!canUseLocalFallback) {
        appendAuthAuditEvent({
          type: 'login_failure',
          actorLogin: payload.login.trim().toLowerCase(),
          detail: message,
        });
        throw new Error(message);
      }
      const login = payload.login.trim().toLowerCase();
      const fallbackUser = readLocalUsers().find((item) => item.login === login) ?? localMockUserByLogin(login);
      if (fallbackUser) {
        if (await senhaArmazenadaValida(payload.senha.trim(), fallbackUser.senha)) {
          const sessionUser = sanitizeUser(fallbackUser);
          setVolatileSessionPasswordAfterSuccessfulLogin(payload.senha.trim());
          persistAuthSession(sessionUser, payload.permanecerLogado);
          appendAuthAuditEvent({
            type: 'login_success',
            actorLogin: sessionUser.login,
            detail: `Login realizado com fallback local por indisponibilidade da nuvem. Sessao ${payload.permanecerLogado ? 'persistente' : 'ate fechar o browser'}.`,
          });
          return sessionUser;
        }
      }
      appendAuthAuditEvent({
        type: 'login_failure',
        actorLogin: payload.login.trim().toLowerCase(),
        detail: message,
      });
      throw new Error(message);
    }
  }

  const localUsers = readLocalUsers();
  const login = payload.login.trim().toLowerCase();
  const user = localUsers.find((item) => item.login === login);
  if (!user || !(await senhaArmazenadaValida(payload.senha.trim(), user.senha))) {
    appendAuthAuditEvent({
      type: 'login_failure',
      actorLogin: login,
      detail: 'Login local recusado por credenciais invalidas.',
    });
    throw new Error('Login ou senha invalidos.');
  }

  const sessionUser = sanitizeUser(user);
  setVolatileSessionPasswordAfterSuccessfulLogin(payload.senha.trim());
  persistAuthSession(sessionUser, payload.permanecerLogado);
  appendAuthAuditEvent({
    type: 'login_success',
    actorLogin: sessionUser.login,
    detail: `Login local realizado com sucesso. Sessao ${payload.permanecerLogado ? 'persistente' : 'ate fechar o browser'}.`,
  });
  return sessionUser;
}

export function logout() {
  const currentUser = getCurrentUser();
  if (currentUser) {
    appendAuthAuditEvent({
      type: 'logout',
      actorLogin: currentUser.login,
      detail: 'Logout realizado pelo usuario.',
    });
  }
  clearAuthSessionStorage();
  clearVolatileSessionPassword();
  invalidateIsoProSnapshotCache();
  resetSupabaseClient();
}

export function getCurrentUser(): AuthUser | null {
  const raw = readAuthSessionRaw();
  if (!raw) return null;

  ensureAuthActivityTimestamp();
  if (isAuthSessionIdleExpired()) {
    let actorLogin = 'desconhecido';
    try {
      const parsed: unknown = JSON.parse(raw);
      const u = parseAuthSessionUser(parsed);
      if (u?.login) actorLogin = u.login;
    } catch {
      /* ignora */
    }
    invalidateSessionForIdle(actorLogin);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearAuthSessionStorage();
    clearVolatileSessionPassword();
    return null;
  }

  const user = parseAuthSessionUser(parsed);
  if (user === null) {
    clearAuthSessionStorage();
    clearVolatileSessionPassword();
    return null;
  }

  const merged = mergePermissoesComDefaultsPerfil(user.permissoes, user.perfil.id);
  if (JSON.stringify(merged) !== JSON.stringify(user.permissoes)) {
    const next: AuthUser = { ...user, permissoes: merged };
    const backend = getActiveAuthSessionStorage() ?? window.localStorage;
    backend.setItem(getAuthSessionStorageKey(), JSON.stringify(next));
    return next;
  }

  return user;
}

async function refreshRemoteSession(user: AuthUser): Promise<AuthUser | null> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new AuthServiceError('Supabase nao configurado.', 'remote_unavailable');
  }

  const { data, error } = await supabase
    .from('usuarios_sistema')
    .select('id,login,nome,senha,ativo,perfis_acesso(id,codigo,nome,perfil_permissoes(modulo,acao,permitido)),usuario_permissoes(modulo,acao,permitido)')
    .eq('id', user.id)
    .eq('tenant_id', getActiveTenantId())
    .eq('ativo', true)
    .maybeSingle();

  if (error) {
    throw new AuthServiceError(error.message, 'remote_unavailable');
  }

  const refreshed = data as RemoteUserRow | null;
  if (!refreshed) {
    appendAuthAuditEvent({
      type: 'session_invalidated',
      actorLogin: user.login,
      detail: 'Sessao invalidada porque o usuario deixou de estar ativo na base principal.',
    });
    clearAuthSessionStorage();
    clearVolatileSessionPassword();
    return null;
  }

  const sessionUser = mapRemoteUser(refreshed);
  const backend = getActiveAuthSessionStorage() ?? window.localStorage;
  backend.setItem(getAuthSessionStorageKey(), JSON.stringify(sessionUser));
  touchAuthSessionActivity();
  return sessionUser;
}

function refreshLocalSession(user: AuthUser): AuthUser | null {
  const localUser = readLocalUsers().find((item) => item.id === user.id || item.login === user.login);
  if (!localUser) {
    appendAuthAuditEvent({
      type: 'session_invalidated',
      actorLogin: user.login,
      detail: 'Sessao invalidada porque o usuario nao foi encontrado na base local.',
    });
    clearAuthSessionStorage();
    clearVolatileSessionPassword();
    return null;
  }

  const sessionUser = sanitizeUser(localUser);
  const backend = getActiveAuthSessionStorage() ?? window.localStorage;
  backend.setItem(getAuthSessionStorageKey(), JSON.stringify(sessionUser));
  touchAuthSessionActivity();
  return sessionUser;
}

/**
 * Em desenvolvimento, sessão dos utilizadores mock (id `local-*`) não existe no Supabase;
 * sem este atalho o refresh remoto limpava a sessão logo após o login.
 */
function isEmbeddedLocalMockSession(user: AuthUser) {
  return user.id.startsWith('local-');
}

/**
 * Com `vite` (`npm run dev` / `dev:web`), abre direto no navegador ou Electron como admin local.
 * Não depende de variável no .env. Desative com `VITE_DISABLE_DEV_AUTO_LOGIN=true`. Não corre em Vitest (`MODE === 'test'`).
 */
export function ensureDevLocalAdminSession(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null;
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return null;
  if (isTruthyEnv(import.meta.env.VITE_DISABLE_DEV_AUTO_LOGIN)) return null;
  const sessionUser = sanitizeUser(mockUsers.admin);
  setVolatileSessionPasswordAfterSuccessfulLogin(mockUsers.admin.senha);
  persistAuthSession(sessionUser, true);
  return sessionUser;
}

export async function validateCurrentSession(user: AuthUser | null): Promise<AuthUser | null> {
  if (!user) return null;

  if (isEmbeddedLocalMockSession(user)) {
    const resolved = resolveEmbeddedLocalMockUser(user);
    if (!resolved) {
      appendAuthAuditEvent({
        type: 'session_invalidated',
        actorLogin: user.login,
        detail: 'Sessao local embutida nao encontrada nos mocks nem na lista local.',
      });
      clearAuthSessionStorage();
      clearVolatileSessionPassword();
      return null;
    }
    const sessionUser = sanitizeUser(resolved);
    const backend = getActiveAuthSessionStorage() ?? window.localStorage;
    backend.setItem(getAuthSessionStorageKey(), JSON.stringify(sessionUser));
    touchAuthSessionActivity();
    return sessionUser;
  }

  if (hasSupabaseConfig()) {
    try {
      const refreshed = await refreshRemoteSession(user);
      if (refreshed) touchAuthSessionActivity();
      return refreshed;
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === 'remote_unavailable') {
        touchAuthSessionActivity();
        return user;
      }
      clearAuthSessionStorage();
      clearVolatileSessionPassword();
      return null;
    }
  }

  return refreshLocalSession(user);
}

export function canAccessModule(user: AuthUser | null, modulo: AppModule) {
  if (!user) return false;
  return user.permissoes.some((permissao) => permissao.modulo === modulo && permissao.acao === 'visualizar' && permissao.permitido);
}

export function canAccessAction(user: AuthUser | null, modulo: AppModule, acao: PermissionAction) {
  if (!user) return false;
  return user.permissoes.some((permissao) => permissao.modulo === modulo && permissao.acao === acao && permissao.permitido);
}

/**
 * Confirma a senha do utilizador atual (mesma logica que login: Supabase, fallback local, mocks embutidos).
 * Usado para acoes criticas (ex.: exclusao definitiva de materiais).
 */
export async function verifyCurrentUserPassword(senha: string): Promise<boolean> {
  const trimmed = senha.trim();
  if (!trimmed) return false;

  const user = getCurrentUser();
  if (!user) return false;

  if (isEmbeddedLocalMockSession(user)) {
    const resolved = resolveEmbeddedLocalMockUser(user);
    return resolved != null && (await senhaArmazenadaValida(trimmed, resolved.senha));
  }

  if (hasSupabaseConfig()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('usuarios_sistema')
          .select('senha')
          .eq('id', user.id)
          .eq('tenant_id', getActiveTenantId())
          .eq('ativo', true)
          .maybeSingle();
        if (!error && data != null) {
          const stored = String((data as { senha?: string }).senha ?? '');
          return senhaArmazenadaValida(trimmed, stored);
        }
      } catch {
        // tentativa fallback local abaixo
      }
    }
    const localUser = readLocalUsers().find((item) => item.id === user.id || item.login === user.login);
    return localUser != null && (await senhaArmazenadaValida(trimmed, localUser.senha));
  }

  const localUser = readLocalUsers().find((item) => item.id === user.id || item.login === user.login);
  return localUser != null && (await senhaArmazenadaValida(trimmed, localUser.senha));
}
