import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { getSupabase, hasSupabaseConfig, resetSupabaseClient } from '../../../lib/supabase';
import type { AppModule, AuthUser, LoginPayload, Permission, PermissionAction } from '../types/auth.types';
import { appendAuthAuditEvent } from './authAudit.service';

export const AUTH_SESSION_STORAGE_KEY = 'iso-pro-desktop-session';
export const AUTH_USERS_STORAGE_KEY = 'iso-pro-desktop-usuarios-sistema';

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
    permissoes: buildPermissions(['dashboard', 'fornecedores', 'colaboradores', 'documentos', 'materiais', 'etiquetas', 'relatorios']),
  },
  operacao: {
    id: 'local-operacao',
    login: 'operacao',
    senha: '1234',
    nome: 'Operacao',
    perfil: { id: 'operacao', nome: 'Operacao' },
    permissoes: buildPermissions(['dashboard', 'recebimentos', 'conferencia', 'etiquetas', 'atendimento', 'inventario', 'rir', 'rnc', 'mobile']),
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

/** Usuarios embutidos (admin/planejamento etc.) so em dev ou com VITE_ENABLE_LOCAL_MOCK_AUTH=true — evita build de producao com credenciais conhecidas. */
function isLocalMockAuthSeedEnabled() {
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

/** Utilizador mock embutido mesmo quando existe lista em `AUTH_USERS_STORAGE_KEY` sem estes IDs. */
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
  const raw = localStorage.getItem(AUTH_USERS_STORAGE_KEY);
  if (!raw) return localMockUsersFallbackList();

  try {
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      login: string;
      nome: string;
      senha: string;
      ativo: boolean;
      perfilId: string;
      perfilNome: string;
      permissoes?: Permission[];
    }>;

    return parsed
      .filter((item) => item.ativo)
      .map((item) => ({
        id: item.id,
        login: item.login,
        nome: item.nome,
        senha: item.senha,
        perfil: { id: item.perfilId, nome: item.perfilNome },
        permissoes:
          item.permissoes && item.permissoes.length
            ? item.permissoes.map((permission) => ({
                modulo: permission.modulo,
                acao: normalizePermissionAction(permission.acao),
                permitido: permission.permitido,
              }))
            : buildPermissions(mockPermissionsByProfileId.get(item.perfilId) ?? []),
      }));
  } catch {
    return localMockUsersFallbackList();
  }
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
    .eq('ativo', true)
    .maybeSingle();

  if (error) {
    throw new AuthServiceError(error.message, 'remote_unavailable');
  }

  const user = data as RemoteUserRow | null;
  if (!user || String(user.senha ?? '') !== senha) {
    throw new AuthServiceError('Login ou senha invalidos.', 'invalid_credentials');
  }

  const sessionUser = mapRemoteUser(user);
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
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
        if (fallbackUser.senha === payload.senha.trim()) {
          const sessionUser = sanitizeUser(fallbackUser);
          localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
          appendAuthAuditEvent({
            type: 'login_success',
            actorLogin: sessionUser.login,
            detail: 'Login realizado com fallback local por indisponibilidade da nuvem.',
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
  if (!user || user.senha !== payload.senha.trim()) {
    appendAuthAuditEvent({
      type: 'login_failure',
      actorLogin: login,
      detail: 'Login local recusado por credenciais invalidas.',
    });
    throw new Error('Login ou senha invalidos.');
  }

  const sessionUser = sanitizeUser(user);
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
  appendAuthAuditEvent({
    type: 'login_success',
    actorLogin: sessionUser.login,
    detail: 'Login local realizado com sucesso.',
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
  localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  invalidateIsoProSnapshotCache();
  resetSupabaseClient();
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
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
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }

  const sessionUser = mapRemoteUser(refreshed);
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
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
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }

  const sessionUser = sanitizeUser(localUser);
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
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
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
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
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    const sessionUser = sanitizeUser(resolved);
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  }

  if (hasSupabaseConfig()) {
    try {
      return await refreshRemoteSession(user);
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === 'remote_unavailable') {
        return user;
      }
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
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
    return resolved != null && resolved.senha === trimmed;
  }

  if (hasSupabaseConfig()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('usuarios_sistema')
          .select('senha')
          .eq('id', user.id)
          .eq('ativo', true)
          .maybeSingle();
        if (!error && data != null) {
          return String((data as { senha?: string }).senha ?? '') === trimmed;
        }
      } catch {
        // tentativa fallback local abaixo
      }
    }
    const localUser = readLocalUsers().find((item) => item.id === user.id || item.login === user.login);
    return localUser != null && localUser.senha === trimmed;
  }

  const localUser = readLocalUsers().find((item) => item.id === user.id || item.login === user.login);
  return localUser != null && localUser.senha === trimmed;
}
