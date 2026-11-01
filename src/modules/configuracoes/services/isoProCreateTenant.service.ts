import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { readConfiguracoes } from './configuracoes.service';

type CreateTenantResponseBody = {
  ok?: boolean;
  message?: string;
  tenant?: { id: string; slug: string; name: string };
  admin?: { id: string; login: string; nome: string };
};

export type IsoProCreateTenantInput = {
  actorTenantId: string;
  actorLogin: string;
  actorSenha: string;
  slug: string;
  nomeEmpresa: string;
  adminLogin: string;
  adminNome: string;
  adminSenha: string;
  secret?: string;
};

/**
 * Cria empresa (tenant) via Edge `iso_pro_create_tenant` (mesmo segredo que `iso_pro_admin_user`).
 */
export async function executarIsoProCreateTenant(
  input: IsoProCreateTenantInput,
): Promise<ServiceResult<{ tenant: { id: string; slug: string; name: string }; adminLogin: string }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel.' };
  }

  const secret = (input.secret ?? readConfiguracoes().isoProAdminUserSecret).trim();
  if (!secret) {
    return {
      success: false,
      error:
        'Defina o segredo em Configuracoes > Supabase e nuvem (mesmo valor de ISO_PRO_ADMIN_USER_SECRET no Dashboard).',
    };
  }

  const { data, error } = await supabase.functions.invoke<CreateTenantResponseBody>('iso_pro_create_tenant', {
    body: {
      actorTenantId: input.actorTenantId,
      actorLogin: input.actorLogin,
      actorSenha: input.actorSenha,
      slug: input.slug,
      nomeEmpresa: input.nomeEmpresa,
      adminLogin: input.adminLogin,
      adminNome: input.adminNome,
      adminSenha: input.adminSenha,
    },
    headers: {
      'x-iso-pro-admin-user-secret': secret,
    },
  });

  if (error) {
    const msg = await extrairMensagem(error);
    return { success: false, error: msg };
  }

  if (!data?.ok || !data.tenant?.id) {
    return { success: false, error: data?.message ?? 'Resposta inesperada ao criar empresa.' };
  }

  return {
    success: true,
    data: {
      tenant: {
        id: String(data.tenant.id),
        slug: String(data.tenant.slug ?? ''),
        name: String(data.tenant.name ?? ''),
      },
      adminLogin: String(data.admin?.login ?? input.adminLogin),
    },
  };
}

async function extrairMensagem(error: unknown): Promise<string> {
  if (error instanceof Error && error.message) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as CreateTenantResponseBody;
        if (j?.message) return j.message;
      } catch {
        /* ignora */
      }
    }
    return error.message;
  }
  return 'Falha ao invocar iso_pro_create_tenant.';
}
