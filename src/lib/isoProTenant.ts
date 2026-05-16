/**
 * Multi-tenant (várias empresas no mesmo projeto Supabase).
 * O tenant activo escolhido no browser é enviado em todas as queries (`tenant_id`).
 * RLS forte nos dados exige migração futura para Supabase Auth + claims (ver comentários na migração SQL).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Tenant por omissão para bases já existentes (uma organização). */
export const ISO_PRO_DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export const ISO_PRO_TENANT_CONTEXT_STORAGE_KEY = 'iso-pro-desktop-cloud-tenant-ativo-v1';

type TenantEstadoV1 = {
  version: 1;
  activeTenantId: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function getActiveTenantId(): string {
  if (typeof localStorage === 'undefined') return ISO_PRO_DEFAULT_TENANT_ID;
  try {
    const raw = localStorage.getItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY);
    if (!raw) return ISO_PRO_DEFAULT_TENANT_ID;
    const parsed = JSON.parse(raw) as Partial<TenantEstadoV1>;
    if (parsed.version === 1 && typeof parsed.activeTenantId === 'string' && isUuid(parsed.activeTenantId)) {
      return parsed.activeTenantId;
    }
  } catch {
    /* ignore */
  }
  return ISO_PRO_DEFAULT_TENANT_ID;
}

export function setActiveTenantId(id: string): void {
  if (!isUuid(id)) return;
  const next: TenantEstadoV1 = { version: 1, activeTenantId: id };
  localStorage.setItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY, JSON.stringify(next));
}

/** Troca empresa na nuvem e recarrega (sessão será revalidada contra o novo tenant). */
export function aplicarTenantAtivoERecarregar(id: string): void {
  if (id === getActiveTenantId()) return;
  setActiveTenantId(id);
  window.location.reload();
}

export type IsoProTenantListItem = {
  id: string;
  slug: string;
  name: string;
};

export async function carregarListaTenantsNuvem(supabase: SupabaseClient): Promise<IsoProTenantListItem[]> {
  const { data, error } = await supabase.from('iso_pro_tenants').select('id,slug,name').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    slug: String((row as { slug?: string }).slug ?? ''),
    name: String((row as { name?: string }).name ?? ''),
  }));
}
