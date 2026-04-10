import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { getCurrentUser } from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import type { AppModule, PermissionAction } from '../../auth/types/auth.types';
import type { UsuarioFiltro, UsuarioFormData, UsuarioPerfil, UsuarioPermissao, UsuarioSistema } from '../types/usuario.types';

const USERS_STORAGE_KEY = 'iso-pro-desktop-usuarios-sistema';
const PROFILES_STORAGE_KEY = 'iso-pro-desktop-perfis-acesso';

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

const ALL_ACTIONS: PermissionAction[] = ['visualizar', 'editar', 'administrar'];

type RemotePermissionRow = {
  modulo?: string | null;
  acao?: string | null;
  permitido?: boolean | null;
};

type RemoteProfileRow = {
  id?: string | null;
  codigo?: string | null;
  nome?: string | null;
  perfil_permissoes?: RemotePermissionRow[] | null;
};

type RemoteUserRow = {
  id?: string | null;
  login?: string | null;
  nome?: string | null;
  ativo?: boolean | null;
  perfil_id?: string | null;
  perfis_acesso?: { nome?: string | null } | null;
  usuario_permissoes?: RemotePermissionRow[] | null;
};

function normalizeAction(value: string | null | undefined): PermissionAction {
  if (value === 'editar' || value === 'administrar') return value;
  return 'visualizar';
}

function buildPermissionsFromAllowedModules(allowedModules: AppModule[]): UsuarioPermissao[] {
  return ALL_MODULES.flatMap((modulo) =>
    ALL_ACTIONS.map((acao) => ({
      modulo,
      acao,
      permitido: allowedModules.includes(modulo),
    })),
  );
}

function normalizePermissions(permissoes: UsuarioPermissao[]): UsuarioPermissao[] {
  const allowedPermissions = new Set(
    permissoes.filter((item) => item.permitido).map((item) => `${item.modulo}:${item.acao}`),
  );

  return ALL_MODULES.flatMap((modulo) =>
    ALL_ACTIONS.map((acao) => ({
      modulo,
      acao,
      permitido: allowedPermissions.has(`${modulo}:${acao}`),
    })),
  );
}

const seedProfiles: UsuarioPerfil[] = [
  { id: 'admin', codigo: 'admin', nome: 'Administrador', permissoes: buildPermissionsFromAllowedModules(ALL_MODULES) },
  { id: 'planejamento', codigo: 'planejamento', nome: 'Planejamento', permissoes: buildPermissionsFromAllowedModules(['dashboard', 'fornecedores', 'colaboradores', 'materiais', 'documentos', 'etiquetas', 'relatorios']) },
  { id: 'operacao', codigo: 'operacao', nome: 'Operacao', permissoes: buildPermissionsFromAllowedModules(['dashboard', 'recebimentos', 'conferencia', 'etiquetas', 'atendimento', 'inventario', 'rir', 'rnc', 'mobile']) },
  { id: 'consulta', codigo: 'consulta', nome: 'Consulta', permissoes: buildPermissionsFromAllowedModules(['dashboard', 'relatorios']) },
];

const seedUsers: Array<UsuarioSistema & { senha: string }> = [
  { id: 'local-admin', login: 'admin', nome: 'Administrador', senha: 'admin', ativo: true, perfilId: 'admin', perfilNome: 'Administrador', permissoes: seedProfiles[0].permissoes },
  { id: 'local-planejamento', login: 'planejamento', nome: 'Planejamento', senha: '1234', ativo: true, perfilId: 'planejamento', perfilNome: 'Planejamento', permissoes: seedProfiles[1].permissoes },
  { id: 'local-operacao', login: 'operacao', nome: 'Operacao', senha: '1234', ativo: true, perfilId: 'operacao', perfilNome: 'Operacao', permissoes: seedProfiles[2].permissoes },
  { id: 'local-consulta', login: 'consulta', nome: 'Consulta', senha: '1234', ativo: true, perfilId: 'consulta', perfilNome: 'Consulta', permissoes: seedProfiles[3].permissoes },
];

function readLocal<T>(key: string, seed: T[]): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(seed));
    return [...seed];
  }

  try {
    return JSON.parse(raw) as T[];
  } catch {
    localStorage.setItem(key, JSON.stringify(seed));
    return [...seed];
  }
}

function writeLocal<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

function registerUserAudit(type: 'user_saved' | 'user_status_changed', targetLogin: string, detail: string) {
  const currentUser = getCurrentUser();
  appendAuthAuditEvent({
    type,
    actorLogin: currentUser?.login ?? 'sistema',
    targetLogin,
    detail,
  });
}

function normalizeLogin(value: string) {
  return value.trim().toLowerCase();
}

function validateUserPayload(payload: UsuarioFormData, currentId?: string): string | null {
  const normalizedLogin = normalizeLogin(payload.login);
  if (!normalizedLogin) return 'Informe o login.';
  if (!payload.nome.trim()) return 'Informe o nome.';
  if (!payload.perfilId) return 'Selecione o perfil base.';
  if (normalizedLogin.includes(' ')) return 'O login nao pode conter espacos.';
  if (!currentId && !payload.senha.trim()) return 'Informe a senha.';
  if (payload.senha.trim() && payload.senha.trim().length < 4) return 'A senha deve ter pelo menos 4 caracteres.';
  if (!payload.permissoes.some((item) => item.acao === 'visualizar' && item.permitido)) {
    return 'Selecione pelo menos um modulo com permissao de visualizacao.';
  }
  return null;
}

function readLocalProfiles() {
  return readLocal<UsuarioPerfil>(PROFILES_STORAGE_KEY, seedProfiles).map((item) => ({
    ...item,
    permissoes: normalizePermissions(item.permissoes),
  }));
}

function readLocalUsers() {
  return readLocal<Array<UsuarioSistema & { senha: string }>[number]>(USERS_STORAGE_KEY, seedUsers).map((item) => ({
    ...item,
    permissoes: normalizePermissions(item.permissoes),
  }));
}

function toUserListItem(item: UsuarioSistema & { senha?: string }): UsuarioSistema {
  return {
    id: item.id,
    login: item.login,
    nome: item.nome,
    ativo: item.ativo,
    perfilId: item.perfilId,
    perfilNome: item.perfilNome,
    permissoes: normalizePermissions(item.permissoes),
  };
}

function mapRemotePermissions(rows: RemotePermissionRow[] | null | undefined): UsuarioPermissao[] {
  return normalizePermissions(
    (rows ?? [])
      .filter((item): item is Required<Pick<RemotePermissionRow, 'modulo'>> & RemotePermissionRow => Boolean(item.modulo && ALL_MODULES.includes(item.modulo as AppModule)))
      .map((item) => ({
        modulo: item.modulo as AppModule,
        acao: normalizeAction(item.acao),
        permitido: Boolean(item.permitido),
      })),
  );
}

async function listRemoteProfiles(): Promise<UsuarioPerfil[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase nao configurado.');

  const { data, error } = await supabase
    .from('perfis_acesso')
    .select('id,codigo,nome,perfil_permissoes(modulo,acao,permitido)')
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data as RemoteProfileRow[] | null) ?? []).map((perfil) => ({
    id: String(perfil.id ?? ''),
    codigo: String(perfil.codigo ?? ''),
    nome: String(perfil.nome ?? ''),
    permissoes: mapRemotePermissions(perfil.perfil_permissoes),
  }));
}

async function listRemoteUsers(): Promise<UsuarioSistema[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase nao configurado.');

  const { data, error } = await supabase
    .from('usuarios_sistema')
    .select('id,login,nome,ativo,perfil_id,perfis_acesso(nome),usuario_permissoes(modulo,acao,permitido)')
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data as RemoteUserRow[] | null) ?? []).map((item) => ({
    id: String(item.id ?? ''),
    login: String(item.login ?? ''),
    nome: String(item.nome ?? ''),
    ativo: Boolean(item.ativo),
    perfilId: String(item.perfil_id ?? ''),
    perfilNome: String(item.perfis_acesso?.nome ?? 'Perfil'),
    permissoes: mapRemotePermissions(item.usuario_permissoes),
  }));
}

export async function listarPerfisAcesso(): Promise<UsuarioPerfil[]> {
  if (hasSupabaseConfig()) {
    try {
      return await listRemoteProfiles();
    } catch {
      return readLocalProfiles();
    }
  }
  return readLocalProfiles();
}

export async function listarUsuarios(filtro: UsuarioFiltro): Promise<ServiceResult<PaginatedResult<UsuarioSistema>>> {
  let items = hasSupabaseConfig() ? await listRemoteUsers().catch(() => readLocalUsers().map(toUserListItem)) : readLocalUsers().map(toUserListItem);

  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    items = items.filter((item) => `${item.nome} ${item.login} ${item.perfilNome}`.toLowerCase().includes(busca));
  }
  if (filtro.status === 'ativos') items = items.filter((item) => item.ativo);
  if (filtro.status === 'inativos') items = items.filter((item) => !item.ativo);
  if (filtro.perfilId) items = items.filter((item) => item.perfilId === filtro.perfilId);

  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;

  return {
    success: true,
    data: { items: items.slice(start, end), total: items.length, page: filtro.page, pageSize: filtro.pageSize },
  };
}

export async function salvarUsuario(payload: UsuarioFormData, currentId?: string): Promise<ServiceResult<UsuarioSistema>> {
  const validationError = validateUserPayload(payload, currentId);
  if (validationError) return { success: false, error: validationError };

  const normalizedPermissions = normalizePermissions(payload.permissoes);
  const normalizedLogin = normalizeLogin(payload.login);

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');

      const { data: duplicatedUser, error: duplicatedError } = await supabase
        .from('usuarios_sistema')
        .select('id')
        .eq('login', normalizedLogin)
        .maybeSingle();
      if (duplicatedError) return { success: false, error: duplicatedError.message };
      if (duplicatedUser && String(duplicatedUser.id ?? '') !== (currentId ?? '')) {
        return { success: false, error: 'Ja existe um usuario com esse login.' };
      }

      const normalized = {
        login: normalizedLogin,
        nome: payload.nome.trim(),
        senha: payload.senha.trim() || undefined,
        perfil_id: payload.perfilId,
        ativo: payload.ativo,
      };

      if (currentId) {
        const { data, error } = await supabase
          .from('usuarios_sistema')
          .update(normalized)
          .eq('id', currentId)
          .select('id,login,nome,ativo,perfil_id,perfis_acesso(nome)')
          .single();
        if (error) return { success: false, error: error.message };

        const { error: deleteError } = await supabase.from('usuario_permissoes').delete().eq('usuario_id', currentId);
        if (deleteError) return { success: false, error: deleteError.message };

        const { error: insertError } = await supabase.from('usuario_permissoes').insert(
          normalizedPermissions.map((item) => ({
            usuario_id: currentId,
            modulo: item.modulo,
            acao: item.acao,
            permitido: item.permitido,
          })),
        );
        if (insertError) return { success: false, error: insertError.message };

        const item = data as RemoteUserRow;
        registerUserAudit('user_saved', String(item.login ?? normalizedLogin), 'Cadastro de usuario atualizado na base principal.');
        return {
          success: true,
          data: {
            id: String(item.id ?? ''),
            login: String(item.login ?? ''),
            nome: String(item.nome ?? ''),
            ativo: Boolean(item.ativo),
            perfilId: String(item.perfil_id ?? ''),
            perfilNome: String(item.perfis_acesso?.nome ?? 'Perfil'),
            permissoes: normalizedPermissions,
          },
        };
      }

      const { data, error } = await supabase
        .from('usuarios_sistema')
        .insert({
          login: normalized.login,
          nome: normalized.nome,
          senha: normalized.senha ?? '',
          perfil_id: normalized.perfil_id,
          ativo: normalized.ativo,
        })
        .select('id,login,nome,ativo,perfil_id,perfis_acesso(nome)')
        .single();
      if (error) return { success: false, error: error.message };

      const createdUserId = String((data as RemoteUserRow).id ?? '');
      const { error: insertError } = await supabase.from('usuario_permissoes').insert(
        normalizedPermissions.map((item) => ({
          usuario_id: createdUserId,
          modulo: item.modulo,
          acao: item.acao,
          permitido: item.permitido,
        })),
      );
      if (insertError) return { success: false, error: insertError.message };

      const item = data as RemoteUserRow;
      registerUserAudit('user_saved', String(item.login ?? normalizedLogin), 'Novo usuario criado na base principal.');
      return {
        success: true,
        data: {
          id: String(item.id ?? ''),
          login: String(item.login ?? ''),
          nome: String(item.nome ?? ''),
          ativo: Boolean(item.ativo),
          perfilId: String(item.perfil_id ?? ''),
          perfilNome: String(item.perfis_acesso?.nome ?? 'Perfil'),
          permissoes: normalizedPermissions,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar usuario.' };
    }
  }

  const profiles = readLocalProfiles();
  const users = readLocalUsers();
  const duplicated = users.find((item) => item.login.toLowerCase() === normalizedLogin && item.id !== currentId);
  if (duplicated) return { success: false, error: 'Ja existe um usuario com esse login.' };

  const perfil = profiles.find((item) => item.id === payload.perfilId);
  if (!perfil) return { success: false, error: 'Perfil nao encontrado.' };

  if (currentId) {
    const index = users.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Usuario nao encontrado.' };
    users[index] = {
      ...users[index],
      login: normalizedLogin,
      nome: payload.nome.trim(),
      senha: payload.senha.trim() || users[index].senha,
      ativo: payload.ativo,
      perfilId: perfil.id,
      perfilNome: perfil.nome,
      permissoes: normalizedPermissions,
    };
    writeLocal(USERS_STORAGE_KEY, users);
    registerUserAudit('user_saved', users[index].login, 'Cadastro de usuario atualizado na base local.');
    return { success: true, data: toUserListItem(users[index]) };
  }

  const created = {
    id: crypto.randomUUID(),
    login: normalizedLogin,
    nome: payload.nome.trim(),
    senha: payload.senha.trim(),
    ativo: payload.ativo,
    perfilId: perfil.id,
    perfilNome: perfil.nome,
    permissoes: normalizedPermissions,
  };
  users.push(created);
  writeLocal(USERS_STORAGE_KEY, users);
  registerUserAudit('user_saved', created.login, 'Novo usuario criado na base local.');
  return { success: true, data: toUserListItem(created) };
}

export async function buscarUsuarioPorId(id: string): Promise<ServiceResult<UsuarioFormData>> {
  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');
      const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('id,login,nome,ativo,perfil_id,usuario_permissoes(modulo,acao,permitido)')
        .eq('id', id)
        .single();
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        data: {
          login: String(data.login ?? ''),
          nome: String(data.nome ?? ''),
          senha: '',
          ativo: Boolean(data.ativo),
          perfilId: String(data.perfil_id ?? ''),
          permissoes: mapRemotePermissions((data as { usuario_permissoes?: RemotePermissionRow[] | null }).usuario_permissoes),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao carregar usuario.' };
    }
  }

  const item = readLocalUsers().find((user) => user.id === id);
  if (!item) return { success: false, error: 'Usuario nao encontrado.' };
  return {
    success: true,
    data: {
      login: item.login,
      nome: item.nome,
      senha: '',
      ativo: item.ativo,
      perfilId: item.perfilId,
      permissoes: item.permissoes,
    },
  };
}

export async function toggleUsuarioStatus(id: string, ativo: boolean): Promise<ServiceResult<UsuarioSistema>> {
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === id && !ativo) {
    return { success: false, error: 'Nao e permitido desativar o usuario atualmente logado.' };
  }

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');
      const { data, error } = await supabase
        .from('usuarios_sistema')
        .update({ ativo })
        .eq('id', id)
        .select('id,login,nome,ativo,perfil_id,perfis_acesso(nome),usuario_permissoes(modulo,acao,permitido)')
        .single();
      if (error) return { success: false, error: error.message };
      const item = data as RemoteUserRow;
      registerUserAudit('user_status_changed', String(item.login ?? ''), `Status na base principal alterado para ${ativo ? 'ativo' : 'inativo'}.`);
      return {
        success: true,
        data: {
          id: String(item.id ?? ''),
          login: String(item.login ?? ''),
          nome: String(item.nome ?? ''),
          ativo: Boolean(item.ativo),
          perfilId: String(item.perfil_id ?? ''),
          perfilNome: String(item.perfis_acesso?.nome ?? 'Perfil'),
          permissoes: mapRemotePermissions(item.usuario_permissoes),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao atualizar usuario.' };
    }
  }

  const users = readLocalUsers();
  const index = users.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Usuario nao encontrado.' };
  users[index] = { ...users[index], ativo };
  writeLocal(USERS_STORAGE_KEY, users);
  registerUserAudit('user_status_changed', users[index].login, `Status local alterado para ${ativo ? 'ativo' : 'inativo'}.`);
  return { success: true, data: toUserListItem(users[index]) };
}

export function listarModulosDisponiveis() {
  return buildPermissionsFromAllowedModules(ALL_MODULES);
}
