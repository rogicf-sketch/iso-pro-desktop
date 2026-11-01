import { resolveSupabaseCredentials, getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { canUseDesktopSupabaseFetch, createDesktopSupabaseFetch } from '../../../lib/supabaseDesktopFetch';
import type { ServiceResult } from '../../../types/common.types';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';

type AdminUserResponseBody = {
  ok?: boolean;
  message?: string;
  user?: Record<string, unknown>;
};

export type IsoProAdminUserPermissaoRow = {
  modulo: string;
  acao: string;
  permitido: boolean;
};

export type IsoProAdminUserUpsertInput = {
  secret: string;
  tenantId: string;
  actorLogin: string;
  actorSenha: string;
  mode: 'create' | 'update';
  usuarioId?: string;
  /** Por omissão true no create: cria Auth user + auth_user_id. */
  provisionAuth?: boolean;
  authEmail?: string;
  user: {
    login: string;
    nome: string;
    senha?: string;
    perfil_id: string;
    ativo: boolean;
    colaborador_id: string | null;
  };
  permissoes: IsoProAdminUserPermissaoRow[];
};

/**
 * Indica se o desktop deve gravar utilizadores na nuvem via Edge Function `iso_pro_admin_user`
 * (segredo em Configurações, alinhado a `ISO_PRO_ADMIN_USER_SECRET` no Supabase).
 */
export function isIsoProAdminUserEdgeConfigured(): boolean {
  return readConfiguracoes().isoProAdminUserSecret.trim().length > 0;
}

/** Erros de rede/CORS do cliente Supabase Functions — permitem fallback directo no update. */
export function isIsoProAdminUserEdgeUnreachableError(message: string | undefined | null): boolean {
  const msg = String(message ?? '');
  return (
    /Failed to send a request to the Edge Function/i.test(msg) ||
    /Nao foi possivel contactar a funcao de gravacao de utilizadores/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /NetworkError/i.test(msg) ||
    /Load failed/i.test(msg)
  );
}

/**
 * Invoca `iso_pro_admin_user` via fetch directo (mais fiavel que functions.invoke no browser/Electron).
 * Segredo vai no corpo (`adminUserSecret`) para evitar CORS com cabecalho custom.
 */
export async function executarIsoProAdminUserUpsert(
  input: IsoProAdminUserUpsertInput,
): Promise<ServiceResult<{ user: Record<string, unknown> }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }

  const secret = input.secret.trim();
  if (!secret) {
    return {
      success: false,
      error: 'Defina o segredo em Configuracoes > Supabase e nuvem (criar utilizador na nuvem).',
    };
  }

  const { url, key } = resolveSupabaseCredentials();
  if (!url || !key) {
    return { success: false, error: 'URL/chave Supabase em falta.' };
  }

  const body: Record<string, unknown> = {
    tenantId: input.tenantId,
    actorLogin: input.actorLogin,
    actorSenha: input.actorSenha,
    mode: input.mode,
    user: input.user,
    permissoes: input.permissoes,
    provisionAuth: input.provisionAuth !== false,
    adminUserSecret: secret,
  };
  if (input.authEmail?.trim()) {
    body.authEmail = input.authEmail.trim();
  }
  if (input.mode === 'update' && input.usuarioId) {
    body.usuarioId = input.usuarioId;
  }

  let accessToken = key;
  try {
    const supabase = getSupabase();
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (session?.access_token) {
      accessToken = session.access_token;
    }
  } catch {
    /* anon key basta com verify_jwt=false */
  }

  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/iso_pro_admin_user`;
  const fetchImpl = canUseDesktopSupabaseFetch() ? createDesktopSupabaseFetch() : fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro de rede';
    return {
      success: false,
      error: `Nao foi possivel contactar a funcao de gravacao de utilizadores (rede/CORS). Detalhe: ${detail}`,
    };
  }

  let bodyOut: AdminUserResponseBody | null = null;
  try {
    bodyOut = (await response.json()) as AdminUserResponseBody;
  } catch {
    bodyOut = null;
  }

  if (!response.ok) {
    const msg =
      bodyOut?.message ||
      (response.status === 401
        ? 'Segredo ISO_PRO_ADMIN_USER_SECRET incorrecto. Em Configuracoes > Supabase e nuvem, cole o mesmo valor dos Secrets da Edge no Dashboard e grave.'
        : `Falha ao gravar utilizador (HTTP ${response.status}).`);
    return { success: false, error: msg };
  }

  if (bodyOut && bodyOut.ok === false && bodyOut.message) {
    return { success: false, error: bodyOut.message };
  }
  if (!bodyOut?.ok || !bodyOut.user || typeof bodyOut.user !== 'object') {
    return {
      success: false,
      error: bodyOut?.message ?? 'Resposta inesperada da funcao iso_pro_admin_user.',
    };
  }

  return { success: true, data: { user: bodyOut.user } };
}
