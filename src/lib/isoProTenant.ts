/**
 * Multi-tenant (várias empresas no mesmo projeto Supabase).
 * O tenant activo escolhido no browser é enviado em RPCs (`p_tenant_id`) e filtros PostgREST.
 * Com sessão JWT (`authenticated`), o PostgreSQL valida o claim `tenant_id` via
 * `iso_pro_assert_tenant_caller` + RLS `iso_pro_rls_tenant_row_allowed` — o payload do cliente
 * deixa de ser a fonte de confiança. Trocar de empresa limpa a sessão JWT.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resetSupabaseClient } from './supabase';

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
  if (id === getActiveTenantId()) return;
  const next: TenantEstadoV1 = { version: 1, activeTenantId: id };
  localStorage.setItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY, JSON.stringify(next));
  resetSupabaseClient();
  if (typeof window !== 'undefined') {
    void import('./isoProJwtSession').then((m) => m.clearIsoProJwtSession());
    void import('./isoProSnapshot').then((m) => m.invalidateIsoProSnapshotCache());
  }
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
