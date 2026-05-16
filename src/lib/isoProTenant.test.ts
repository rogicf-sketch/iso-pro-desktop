/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ISO_PRO_DEFAULT_TENANT_ID,
  ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
  carregarListaTenantsNuvem,
  getActiveTenantId,
  setActiveTenantId,
} from './isoProTenant';

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isoProTenant', () => {
  it('getActiveTenantId retorna default sem storage', () => {
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
  });

  it('getActiveTenantId le versao 1 valida', () => {
    localStorage.setItem(
      ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
      JSON.stringify({ version: 1, activeTenantId: UUID_A }),
    );
    expect(getActiveTenantId()).toBe(UUID_A);
  });

  it('getActiveTenantId ignora JSON invalido', () => {
    localStorage.setItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY, '{');
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
  });

  it('getActiveTenantId ignora tenantId que nao e uuid', () => {
    localStorage.setItem(
      ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
      JSON.stringify({ version: 1, activeTenantId: 'nope' }),
    );
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
  });

  it('setActiveTenantId ignora id invalido', () => {
    setActiveTenantId('not-uuid');
    expect(localStorage.getItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY)).toBeNull();
  });

  it('setActiveTenantId grava versao 1', () => {
    setActiveTenantId(UUID_A);
    const raw = localStorage.getItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({ version: 1, activeTenantId: UUID_A });
  });

  it('carregarListaTenantsNuvem mapeia id, slug, name', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: UUID_A, slug: 'a', name: 'A' },
        { id: UUID_B, slug: 'b', name: null },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from };

    const rows = await carregarListaTenantsNuvem(supabase as never);
    expect(from).toHaveBeenCalledWith('iso_pro_tenants');
    expect(select).toHaveBeenCalledWith('id,slug,name');
    expect(rows).toEqual([
      { id: UUID_A, slug: 'a', name: 'A' },
      { id: UUID_B, slug: 'b', name: '' },
    ]);
  });

  it('carregarListaTenantsNuvem propaga erro Supabase', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha rls' } });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });
    await expect(carregarListaTenantsNuvem({ from } as never)).rejects.toThrow('falha rls');
  });
});
