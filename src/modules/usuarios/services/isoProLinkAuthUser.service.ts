import { getActiveTenantId } from '../../../lib/isoProTenant';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { getCurrentUser } from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';

type LinkResponseBody = {
  ok?: boolean;
  message?: string;
};

export type IsoProLinkAuthUserInput = {
  usuarioId: string;
  authUserId: string | null;
  secret: string;
  usuarioLogin?: string;
};

/**
 * Invoca a Edge Function `iso_pro_link_auth_user` (secret no cabeçalho; ver `supabase/functions/README.md`).
 */
export async function executarIsoProLinkAuthUser(
  input: IsoProLinkAuthUserInput,
): Promise<ServiceResult<{ message: string }>> {
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
      error: 'Defina o segredo em Configuracoes > Supabase e nuvem (ligacao Auth).',
    };
  }

  const usuarioId = input.usuarioId.trim();
  if (!usuarioId) {
    return { success: false, error: 'Usuario invalido.' };
  }

  const tenantId = getActiveTenantId();

  const { data, error } = await supabase.functions.invoke<LinkResponseBody>('iso_pro_link_auth_user', {
    body: {
      usuarioId,
      tenantId,
      authUserId: input.authUserId,
    },
    headers: {
      'x-iso-pro-link-secret': secret,
    },
  });

  if (error) {
    const msg = await extrairMensagemErroFunctionsInvoke(error);
    return { success: false, error: msg };
  }

  const body = data;
  if (body && body.ok === false && body.message) {
    return { success: false, error: body.message };
  }
  if (!body?.ok) {
    return { success: false, error: body?.message ?? 'Resposta inesperada da funcao iso_pro_link_auth_user.' };
  }

  const currentUser = getCurrentUser();
  appendAuthAuditEvent({
    type: 'user_saved',
    actorLogin: currentUser?.login ?? 'sistema',
    targetLogin: input.usuarioLogin?.trim() || undefined,
    detail: input.authUserId
      ? `Ligacao Supabase Auth definida para utilizador da nuvem (${usuarioId}).`
      : `Ligacao Supabase Auth removida para utilizador da nuvem (${usuarioId}).`,
  });

  return {
    success: true,
    data: { message: body.message ?? 'Ligacao atualizada.' },
  };
}

async function extrairMensagemErroFunctionsInvoke(error: unknown): Promise<string> {
  if (error instanceof Error && error.message) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as LinkResponseBody;
        if (j?.message) return j.message;
      } catch {
        /* ignora */
      }
    }
    return error.message;
  }
  return 'Falha ao invocar iso_pro_link_auth_user.';
}
