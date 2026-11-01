import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import type { IsoProTenantListItem } from '../../../lib/isoProTenant';
import { readConfiguracoes } from './configuracoes.service';
import type { DesktopLicenseRegistryItem } from '../types/desktop-license-registry.types';

type EdgeBody = {
  ok?: boolean;
  message?: string;
  superAdmin?: boolean;
  privateKeyConfigured?: boolean;
  tenants?: IsoProTenantListItem[];
  items?: DesktopLicenseRegistryItem[];
  token?: string;
  payload?: Record<string, unknown>;
  tenant?: IsoProTenantListItem;
};

async function extrairMensagem(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = (await ctx.json()) as { message?: string };
        if (body?.message) return String(body.message);
      } catch {
        /* ignore */
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Falha ao invocar iso_pro_desktop_license.';
}

function resolveSecret(explicit?: string): string {
  return (explicit ?? readConfiguracoes().isoProAdminUserSecret).trim();
}

async function invokeDesktopLicenseEdge(
  body: Record<string, unknown>,
  secret?: string,
): Promise<ServiceResult<EdgeBody>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel.' };
  }
  const sec = resolveSecret(secret);
  if (!sec) {
    return {
      success: false,
      error:
        'Defina o segredo em Configuracoes > Supabase e nuvem (ISO_PRO_ADMIN_USER_SECRET), o mesmo das outras Edges de admin.',
    };
  }

  const { data, error } = await supabase.functions.invoke<EdgeBody>('iso_pro_desktop_license', {
    body,
    headers: { 'x-iso-pro-admin-user-secret': sec },
  });

  if (error) {
    return { success: false, error: await extrairMensagem(error) };
  }
  if (!data?.ok) {
    return { success: false, error: data?.message ?? 'Resposta inesperada da Edge iso_pro_desktop_license.' };
  }
  return { success: true, data };
}

export type SuperAdminLicenseCapabilities = {
  superAdmin: boolean;
  privateKeyConfigured: boolean;
  tenants: IsoProTenantListItem[];
};

export async function fetchSuperAdminLicenseCapabilities(input: {
  actorLogin: string;
  actorSenha: string;
  secret?: string;
}): Promise<ServiceResult<SuperAdminLicenseCapabilities>> {
  const result = await invokeDesktopLicenseEdge(
    {
      mode: 'capabilities',
      actorLogin: input.actorLogin,
      actorSenha: input.actorSenha,
    },
    input.secret,
  );
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }
  return {
    success: true,
    data: {
      superAdmin: Boolean(result.data.superAdmin),
      privateKeyConfigured: Boolean(result.data.privateKeyConfigured),
      tenants: Array.isArray(result.data.tenants) ? result.data.tenants : [],
    },
  };
}

export async function listDesktopLicensesAsSuperAdmin(input: {
  actorLogin: string;
  actorSenha: string;
  tenantId?: string;
  secret?: string;
}): Promise<ServiceResult<DesktopLicenseRegistryItem[]>> {
  const body: Record<string, unknown> = {
    mode: 'list',
    actorLogin: input.actorLogin,
    actorSenha: input.actorSenha,
  };
  if (input.tenantId?.trim()) {
    body.tenantId = input.tenantId.trim();
  }
  const result = await invokeDesktopLicenseEdge(body, input.secret);
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }
  return { success: true, data: Array.isArray(result.data.items) ? result.data.items : [] };
}

export type IssueDesktopLicenseInput = {
  actorLogin: string;
  actorSenha: string;
  tenantId: string;
  issuedTo: string;
  machineFingerprint: string;
  machineLabel?: string;
  expiresAt?: string;
  appVersion?: string;
  secret?: string;
};

export type IssueDesktopLicenseResult = {
  token: string;
  payload: Record<string, unknown>;
  tenant: IsoProTenantListItem;
};

export async function issueDesktopLicenseAsSuperAdmin(
  input: IssueDesktopLicenseInput,
): Promise<ServiceResult<IssueDesktopLicenseResult>> {
  const result = await invokeDesktopLicenseEdge(
    {
      mode: 'issue',
      actorLogin: input.actorLogin,
      actorSenha: input.actorSenha,
      tenantId: input.tenantId,
      issuedTo: input.issuedTo,
      machineFingerprint: input.machineFingerprint,
      machineLabel: input.machineLabel ?? '',
      expiresAt: input.expiresAt ?? '',
      appVersion: input.appVersion ?? '',
    },
    input.secret,
  );
  if (!result.success || !result.data?.token || !result.data.tenant) {
    return { success: false, error: result.error ?? 'Falha ao emitir licenca.' };
  }
  return {
    success: true,
    data: {
      token: result.data.token,
      payload: result.data.payload ?? {},
      tenant: result.data.tenant,
    },
  };
}

export async function setDesktopLicenseStatusAsSuperAdmin(input: {
  actorLogin: string;
  actorSenha: string;
  tenantId: string;
  licenseId: string;
  status: 'active' | 'revoked';
  reason?: string;
  secret?: string;
}): Promise<ServiceResult<{ status: 'active' | 'revoked' }>> {
  const result = await invokeDesktopLicenseEdge(
    {
      mode: 'set_status',
      actorLogin: input.actorLogin,
      actorSenha: input.actorSenha,
      tenantId: input.tenantId,
      licenseId: input.licenseId,
      status: input.status,
      reason: input.reason ?? '',
    },
    input.secret,
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, data: { status: input.status } };
}

export function downloadDesktopLicenseJson(fileBase: string, content: unknown): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const safe = fileBase.replace(/[^\w.-]+/g, '-').slice(0, 80);
  anchor.download = `${safe || 'iso-pro-desktop-licenca'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
