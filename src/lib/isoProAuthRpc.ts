import { getSupabase } from './supabase';

export type IsoProAuthRpcPermission = {
  modulo: string;
  acao: string;
  permitido: boolean;
};

export type IsoProAuthRpcUser = {
  id: string;
  login: string;
  nome: string;
  perfil: { id: string; nome: string };
  permissoes: IsoProAuthRpcPermission[];
};

type AuthRpcResponse = {
  ok?: boolean;
  error?: string;
  user?: IsoProAuthRpcUser;
};

type TokenRpcResponse = {
  ok?: boolean;
  error?: string;
  token?: string;
  expiresAt?: string;
};

export function isIsoProAuthRpcMissing(errorMessage: string): boolean {
  return /iso_pro_autenticar_usuario|iso_pro_criar_token_operacional|iso_pro_refresh_usuario_sessao|could not find the function/i.test(
    errorMessage,
  );
}

function mapRpcUser(raw: IsoProAuthRpcUser): IsoProAuthRpcUser {
  const permissoes = (raw.permissoes ?? []).map((p) => ({
    modulo: String(p.modulo ?? '').trim(),
    acao: String(p.acao ?? 'visualizar').trim(),
    permitido: Boolean(p.permitido),
  }));
  return {
    id: String(raw.id ?? ''),
    login: String(raw.login ?? ''),
    nome: String(raw.nome ?? raw.login ?? 'Utilizador'),
    perfil: {
      id: String(raw.perfil?.id ?? ''),
      nome: String(raw.perfil?.nome ?? 'Perfil'),
    },
    permissoes,
  };
}

/** Normaliza o `user` devolvido por RPCs de autenticação / resolver. */
export function mapIsoProAuthRpcUser(raw: IsoProAuthRpcUser): IsoProAuthRpcUser {
  return mapRpcUser(raw);
}

export async function autenticarUsuarioIsoProRpc(
  tenantId: string,
  login: string,
  senha: string,
  options?: { requiredModule?: string },
): Promise<{ ok: true; user: IsoProAuthRpcUser } | { ok: false; error: string; rpcMissing?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase nao configurado.' };
  }

  try {
    const { data, error } = await supabase.rpc('iso_pro_autenticar_usuario', {
      p_tenant_id: tenantId,
      p_login: login.trim().toLowerCase(),
      p_senha: senha.trim(),
      p_requer_modulo: options?.requiredModule ?? null,
    });

    if (error) {
      const msg = error.message ?? 'Falha na autenticacao RPC.';
      return { ok: false, error: msg, rpcMissing: isIsoProAuthRpcMissing(msg) };
    }

    const body = data as AuthRpcResponse | null;
    if (!body?.ok || !body.user) {
      return { ok: false, error: String(body?.error ?? 'Login ou senha invalidos.') };
    }

    return { ok: true, user: mapRpcUser(body.user) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Falha na autenticacao RPC.';
    return { ok: false, error: msg, rpcMissing: isIsoProAuthRpcMissing(msg) };
  }
}

let cachedOperationalToken: { token: string; expiresAtMs: number; login: string; tenantId: string } | null =
  null;

export function clearCachedOperationalToken(): void {
  cachedOperationalToken = null;
}

export async function obterTokenOperacionalIsoPro(
  tenantId: string,
  login: string,
  senha: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const loginKey = login.trim().toLowerCase();
  if (
    cachedOperationalToken &&
    cachedOperationalToken.tenantId === tenantId &&
    cachedOperationalToken.login === loginKey &&
    Date.now() < cachedOperationalToken.expiresAtMs - 60_000
  ) {
    return { ok: true, token: cachedOperationalToken.token };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_criar_token_operacional', {
    p_tenant_id: tenantId,
    p_login: loginKey,
    p_senha: senha.trim(),
    p_ttl_minutes: 30,
  });

  if (error) {
    return { ok: false, error: error.message ?? 'Falha ao criar token operacional.' };
  }

  const body = data as TokenRpcResponse | null;
  if (!body?.ok || !body.token) {
    return { ok: false, error: String(body?.error ?? 'Falha ao criar token operacional.') };
  }

  const expiresAtMs = body.expiresAt ? Date.parse(body.expiresAt) : Date.now() + 30 * 60_000;
  cachedOperationalToken = {
    token: body.token,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 30 * 60_000,
    login: loginKey,
    tenantId,
  };

  return { ok: true, token: body.token };
}

export async function refreshUsuarioSessaoIsoProRpc(
  tenantId: string,
  userId: string,
): Promise<{ ok: true; user: IsoProAuthRpcUser } | { ok: false; error: string; rpcMissing?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase nao configurado.' };
  }

  const { data, error } = await supabase.rpc('iso_pro_refresh_usuario_sessao', {
    p_tenant_id: tenantId,
    p_user_id: userId,
  });

  if (error) {
    const msg = error.message ?? 'Falha ao revalidar sessao RPC.';
    return { ok: false, error: msg, rpcMissing: isIsoProAuthRpcMissing(msg) };
  }

  const body = data as AuthRpcResponse | null;
  if (!body?.ok || !body.user) {
    return { ok: false, error: String(body?.error ?? 'Sessao invalida.') };
  }

  return { ok: true, user: mapRpcUser(body.user) };
}
