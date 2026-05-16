import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import {
  getAuthUsersStorageKey,
  getCurrentUser,
  getVolatileSessionPassword,
  refreshVolatileSessionPasswordAfterSelfPasswordChange,
} from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { AppModule, PermissionAction } from '../../auth/types/auth.types';
import { buscarColaboradorPorId, listarColaboradores } from '../../colaboradores/services/colaboradores.service';
import { parseUsuariosPerfisLocal, parseUsuariosSistemaLocal } from '../schemas/usuariosLocalArrays.zod';
import type { UsuarioFiltro, UsuarioFormData, UsuarioPerfil, UsuarioPermissao, UsuarioSistema } from '../types/usuario.types';
import { executarIsoProAdminUserUpsert, isIsoProAdminUserEdgeConfigured } from './isoProAdminUser.service';

function profilesStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-perfis-acesso');
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
  colaborador_id?: string | null;
  auth_user_id?: string | null;
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
  { id: 'planejamento', codigo: 'planejamento', nome: 'Planejamento', permissoes: buildPermissionsFromAllowedModules(['dashboard', 'fornecedores', 'colaboradores', 'materiais', 'documentos', 'etiquetas', 'equipamentos', 'relatorios']) },
  { id: 'operacao', codigo: 'operacao', nome: 'Operacao', permissoes: buildPermissionsFromAllowedModules(['dashboard', 'recebimentos', 'conferencia', 'etiquetas', 'equipamentos', 'atendimento', 'inventario', 'rir', 'rnc', 'mobile']) },
  { id: 'consulta', codigo: 'consulta', nome: 'Consulta', permissoes: buildPermissionsFromAllowedModules(['dashboard', 'relatorios']) },
];

const seedUsers: Array<UsuarioSistema & { senha: string }> = [
  {
    id: 'local-admin',
    login: 'admin',
    nome: 'Administrador',
    senha: 'admin',
    ativo: true,
    perfilId: 'admin',
    perfilNome: 'Administrador',
    colaboradorId: null,
    permissoes: seedProfiles[0].permissoes,
  },
  {
    id: 'local-planejamento',
    login: 'planejamento',
    nome: 'Planejamento',
    senha: '1234',
    ativo: true,
    perfilId: 'planejamento',
    perfilNome: 'Planejamento',
    colaboradorId: null,
    permissoes: seedProfiles[1].permissoes,
  },
  {
    id: 'local-operacao',
    login: 'operacao',
    nome: 'Operacao',
    senha: '1234',
    ativo: true,
    perfilId: 'operacao',
    perfilNome: 'Operacao',
    colaboradorId: null,
    permissoes: seedProfiles[2].permissoes,
  },
  {
    id: 'local-consulta',
    login: 'consulta',
    nome: 'Consulta',
    senha: '1234',
    ativo: true,
    perfilId: 'consulta',
    perfilNome: 'Consulta',
    colaboradorId: null,
    permissoes: seedProfiles[3].permissoes,
  },
];

function readLocalArray<T>(key: string, seed: T[], parseRows: (raw: unknown) => unknown[] | null): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(seed));
    return [...seed];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.setItem(key, JSON.stringify(seed));
    return [...seed];
  }

  const rows = parseRows(parsed);
  if (rows === null) {
    localStorage.setItem(key, JSON.stringify(seed));
    return [...seed];
  }

  return rows as T[];
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
  return readLocalArray<UsuarioPerfil>(profilesStorageKey(), seedProfiles, parseUsuariosPerfisLocal).map((item) => ({
    ...item,
    permissoes: normalizePermissions(item.permissoes),
  }));
}

function readLocalUsers() {
  return readLocalArray<Array<UsuarioSistema & { senha: string }>[number]>(
    getAuthUsersStorageKey(),
    seedUsers,
    parseUsuariosSistemaLocal,
  ).map((item) => ({
    ...item,
    colaboradorId: item.colaboradorId ?? null,
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
    colaboradorId: item.colaboradorId ?? null,
    permissoes: normalizePermissions(item.permissoes),
  };
}

async function mapColaboradoresPorId() {
  const res = await listarColaboradores({
    busca: '',
    tipo: 'todos',
    status: 'todos',
    page: 1,
    pageSize: 10000,
  });
  const items = res.success && res.data ? res.data.items : [];
  return new Map(items.map((c) => [c.id, c]));
}

function enrichUsuariosComColaboradorDisplay(items: UsuarioSistema[]): Promise<UsuarioSistema[]> {
  return mapColaboradoresPorId().then((map) =>
    items.map((u) => {
      const c = u.colaboradorId ? map.get(u.colaboradorId) : undefined;
      return {
        ...u,
        colaboradorMatricula: c?.matricula ?? '',
        colaboradorFuncao: c?.funcao ?? '',
      };
    }),
  );
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
    .eq('tenant_id', getActiveTenantId())
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
    .select('id,login,nome,ativo,perfil_id,colaborador_id,perfis_acesso(nome),usuario_permissoes(modulo,acao,permitido)')
    .eq('tenant_id', getActiveTenantId())
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data as RemoteUserRow[] | null) ?? []).map((item) => ({
    id: String(item.id ?? ''),
    login: String(item.login ?? ''),
    nome: String(item.nome ?? ''),
    ativo: Boolean(item.ativo),
    perfilId: String(item.perfil_id ?? ''),
    perfilNome: String(item.perfis_acesso?.nome ?? 'Perfil'),
    colaboradorId: item.colaborador_id ? String(item.colaborador_id) : null,
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
  let items: UsuarioSistema[];
  if (hasSupabaseConfig()) {
    try {
      items = await listRemoteUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao consultar usuarios no Supabase.';
      return {
        success: false,
        error: `${message} A lista nao foi preenchida com dados locais de demonstracao para evitar confusao (ex.: parecer que cadastros sumiram). Corrija rede, credenciais ou politicas RLS na tabela usuarios_sistema e recarregue.`,
      };
    }
  } else {
    items = readLocalUsers().map(toUserListItem);
  }

  items = await enrichUsuariosComColaboradorDisplay(items);

  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    items = items.filter((item) =>
      `${item.nome} ${item.login} ${item.perfilNome} ${item.colaboradorMatricula ?? ''} ${item.colaboradorFuncao ?? ''}`
        .toLowerCase()
        .includes(busca),
    );
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

async function validarColaboradorVinculo(
  colaboradorId: string | null,
  currentId?: string,
): Promise<string | null> {
  const cid = colaboradorId?.trim() || null;
  if (!cid) return null;
  const colOk = await buscarColaboradorPorId(cid);
  if (!colOk.success) return 'Colaborador selecionado nao encontrado no cadastro.';

  if (hasSupabaseConfig()) {
    const supabase = getSupabase();
    if (!supabase) return 'Supabase nao configurado.';
    const { data, error } = await supabase
      .from('usuarios_sistema')
      .select('id,login')
      .eq('colaborador_id', cid)
      .eq('tenant_id', getActiveTenantId());
    if (error) return error.message;
    const row = (data as { id?: string; login?: string }[] | null)?.find((r) => String(r.id ?? '') !== (currentId ?? ''));
    if (row) {
      return `Ja existe um usuario vinculado a este colaborador (${String(row.login ?? '')}).`;
    }
    return null;
  }

  const dup = readLocalUsers().find((u) => (u.colaboradorId ?? null) === cid && u.id !== currentId);
  if (dup) return `Ja existe um usuario vinculado a este colaborador (${dup.login}).`;
  return null;
}

export async function salvarUsuario(payload: UsuarioFormData, currentId?: string): Promise<ServiceResult<UsuarioSistema>> {
  const validationError = validateUserPayload(payload, currentId);
  if (validationError) return { success: false, error: validationError };

  const vinculoError = await validarColaboradorVinculo(payload.colaboradorId, currentId);
  if (vinculoError) return { success: false, error: vinculoError };

  const normalizedPermissions = normalizePermissions(payload.permissoes);
  const normalizedLogin = normalizeLogin(payload.login);
  const colaboradorIdNorm = payload.colaboradorId?.trim() || null;

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');

      const { data: duplicatedUser, error: duplicatedError } = await supabase
        .from('usuarios_sistema')
        .select('id')
        .eq('login', normalizedLogin)
        .eq('tenant_id', getActiveTenantId())
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
        colaborador_id: colaboradorIdNorm,
      };

      const cfg = readConfiguracoes();
      if (isIsoProAdminUserEdgeConfigured()) {
        const actorSenha = getVolatileSessionPassword();
        if (!actorSenha) {
          return {
            success: false,
            error:
              'Para gravar utilizadores na nuvem com o segredo da funcao iso_pro_admin_user activo, termine a sessao e volte a entrar.',
          };
        }
        const actor = getCurrentUser();
        if (!actor) {
          return { success: false, error: 'Sessao invalida.' };
        }
        const tenantId = getActiveTenantId();
        const edgeRes = await executarIsoProAdminUserUpsert({
          secret: cfg.isoProAdminUserSecret.trim(),
          tenantId,
          actorLogin: actor.login,
          actorSenha,
          mode: currentId ? 'update' : 'create',
          usuarioId: currentId,
          user: {
            login: normalizedLogin,
            nome: normalized.nome,
            senha: currentId ? normalized.senha : payload.senha.trim(),
            perfil_id: normalized.perfil_id,
            ativo: normalized.ativo,
            colaborador_id: colaboradorIdNorm,
          },
          permissoes: normalizedPermissions.map((item) => ({
            modulo: item.modulo,
            acao: item.acao,
            permitido: item.permitido,
          })),
        });
        if (!edgeRes.success) {
          return { success: false, error: edgeRes.error ?? 'Falha ao gravar utilizador na nuvem (Edge).' };
        }

        const edgePayload = edgeRes.data;
        if (!edgePayload?.user) {
          return { success: false, error: 'Resposta da funcao iso_pro_admin_user invalida.' };
        }

        if (currentId && actor.id === currentId && payload.senha.trim()) {
          refreshVolatileSessionPasswordAfterSelfPasswordChange(payload.senha.trim());
        }

        const createdOrUpdatedId = currentId ? currentId : String(edgePayload.user.id ?? '');
        if (!createdOrUpdatedId) {
          return { success: false, error: 'Resposta da funcao sem id de utilizador.' };
        }

        const { data: row, error: refErr } = await supabase
          .from('usuarios_sistema')
          .select('id,login,nome,ativo,perfil_id,colaborador_id,perfis_acesso(nome),usuario_permissoes(modulo,acao,permitido)')
          .eq('id', createdOrUpdatedId)
          .eq('tenant_id', tenantId)
          .single();
        if (refErr || !row) {
          return { success: false, error: refErr?.message ?? 'Utilizador gravado mas falhou releitura na nuvem.' };
        }

        const item = row as RemoteUserRow;
        registerUserAudit(
          'user_saved',
          String(item.login ?? normalizedLogin),
          currentId ? 'Cadastro de usuario actualizado na nuvem (Edge).' : 'Novo usuario criado na nuvem (Edge).',
        );
        return {
          success: true,
          data: {
            id: String(item.id ?? ''),
            login: String(item.login ?? ''),
            nome: String(item.nome ?? ''),
            ativo: Boolean(item.ativo),
            perfilId: String(item.perfil_id ?? ''),
            perfilNome: String(item.perfis_acesso?.nome ?? 'Perfil'),
            colaboradorId: item.colaborador_id ? String(item.colaborador_id) : null,
            permissoes: mapRemotePermissions(item.usuario_permissoes),
          },
        };
      }

      if (currentId) {
        const { data, error } = await supabase
          .from('usuarios_sistema')
          .update(normalized)
          .eq('id', currentId)
          .eq('tenant_id', getActiveTenantId())
          .select('id,login,nome,ativo,perfil_id,colaborador_id,perfis_acesso(nome)')
          .single();
        if (error) return { success: false, error: error.message };

        const { error: deleteError } = await supabase
          .from('usuario_permissoes')
          .delete()
          .eq('usuario_id', currentId)
          .eq('tenant_id', getActiveTenantId());
        if (deleteError) return { success: false, error: deleteError.message };

        const tid = getActiveTenantId();
        const { error: insertError } = await supabase.from('usuario_permissoes').insert(
          normalizedPermissions.map((item) => ({
            usuario_id: currentId,
            tenant_id: tid,
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
            colaboradorId: (item as RemoteUserRow).colaborador_id ? String((item as RemoteUserRow).colaborador_id) : null,
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
          colaborador_id: colaboradorIdNorm,
          tenant_id: getActiveTenantId(),
        })
        .select('id,login,nome,ativo,perfil_id,colaborador_id,perfis_acesso(nome)')
        .single();
      if (error) return { success: false, error: error.message };

      const createdUserId = String((data as RemoteUserRow).id ?? '');
      const tidNovo = getActiveTenantId();
      const { error: insertError } = await supabase.from('usuario_permissoes').insert(
        normalizedPermissions.map((item) => ({
          usuario_id: createdUserId,
          tenant_id: tidNovo,
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
          colaboradorId: (item as RemoteUserRow).colaborador_id ? String((item as RemoteUserRow).colaborador_id) : null,
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

  const blockedUser = whenBusinessWriteBlockedResult<UsuarioSistema>();
  if (blockedUser) return blockedUser;

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
      colaboradorId: colaboradorIdNorm,
      permissoes: normalizedPermissions,
    };
    writeLocal(getAuthUsersStorageKey(), users);
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
    colaboradorId: colaboradorIdNorm,
    permissoes: normalizedPermissions,
  };
  users.push(created);
  writeLocal(getAuthUsersStorageKey(), users);
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
        .select('id,login,nome,ativo,perfil_id,colaborador_id,auth_user_id,usuario_permissoes(modulo,acao,permitido)')
        .eq('id', id)
        .eq('tenant_id', getActiveTenantId())
        .single();
      if (error) return { success: false, error: error.message };
      const row = data as RemoteUserRow & { usuario_permissoes?: RemotePermissionRow[] | null };
      const authUid = row.auth_user_id != null && String(row.auth_user_id).trim() !== '' ? String(row.auth_user_id).trim() : null;
      return {
        success: true,
        data: {
          login: String(data.login ?? ''),
          nome: String(data.nome ?? ''),
          senha: '',
          ativo: Boolean(data.ativo),
          perfilId: String(data.perfil_id ?? ''),
          colaboradorId: row.colaborador_id ? String(row.colaborador_id) : null,
          authUserIdSupabase: authUid,
          permissoes: mapRemotePermissions(row.usuario_permissoes),
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
      colaboradorId: item.colaboradorId ?? null,
      authUserIdSupabase: null,
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
        .eq('tenant_id', getActiveTenantId())
        .select('id,login,nome,ativo,perfil_id,colaborador_id,perfis_acesso(nome),usuario_permissoes(modulo,acao,permitido)')
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
          colaboradorId: item.colaborador_id ? String(item.colaborador_id) : null,
          permissoes: mapRemotePermissions(item.usuario_permissoes),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao atualizar usuario.' };
    }
  }

  const blockedToggleUser = whenBusinessWriteBlockedResult<UsuarioSistema>();
  if (blockedToggleUser) return blockedToggleUser;

  const users = readLocalUsers();
  const index = users.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Usuario nao encontrado.' };
  users[index] = { ...users[index], ativo };
  writeLocal(getAuthUsersStorageKey(), users);
  registerUserAudit('user_status_changed', users[index].login, `Status local alterado para ${ativo ? 'ativo' : 'inativo'}.`);
  return { success: true, data: toUserListItem(users[index]) };
}

export function listarModulosDisponiveis() {
  return buildPermissionsFromAllowedModules(ALL_MODULES);
}
