import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
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

/**
 * Invoca `iso_pro_admin_user` com cabeçalho de segredo (ver `supabase/functions/README.md`).
 */
export async function executarIsoProAdminUserUpsert(
  input: IsoProAdminUserUpsertInput,
): Promise<ServiceResult<{ user: Record<string, unknown> }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel.' };
  }

  const secret = input.secret.trim();
  if (!secret) {
    return {
      success: false,
      error: 'Defina o segredo em Configuracoes > Supabase e nuvem (criar utilizador na nuvem).',
    };
  }

  const body: Record<string, unknown> = {
    tenantId: input.tenantId,
    actorLogin: input.actorLogin,
    actorSenha: input.actorSenha,
    mode: input.mode,
    user: input.user,
    permissoes: input.permissoes,
  };
  if (input.mode === 'update' && input.usuarioId) {
    body.usuarioId = input.usuarioId;
  }

  const { data, error } = await supabase.functions.invoke<AdminUserResponseBody>('iso_pro_admin_user', {
    body,
    headers: {
      'x-iso-pro-admin-user-secret': secret,
    },
  });

  if (error) {
    const msg = await extrairMensagemErroFunctionsInvoke(error);
    return { success: false, error: msg };
  }

  const bodyOut = data;
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

async function extrairMensagemErroFunctionsInvoke(error: unknown): Promise<string> {
  if (error instanceof Error && error.message) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as AdminUserResponseBody;
        if (j?.message) return j.message;
      } catch {
        /* ignora */
      }
    }
    return error.message;
  }
  return 'Falha ao invocar iso_pro_admin_user.';
}
