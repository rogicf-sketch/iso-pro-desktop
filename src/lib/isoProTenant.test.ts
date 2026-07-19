/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ISO_PRO_DEFAULT_TENANT_ID,
  ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
  getActiveTenantId,
  setActiveTenantId,
} from './isoProTenant';

const UUID_B = '22222222-2222-2222-2222-222222222222';

describe('isoProTenant', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('usa tenant default quando nao ha contexto gravado', () => {
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
  });

  it('ignora tenant invalido (nao UUID) em setActiveTenantId', () => {
    setActiveTenantId('tenant-invalido');
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
    expect(localStorage.getItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY)).toBeNull();
  });

  it('ignora JSON corrompido e volta ao default', () => {
    localStorage.setItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY, '{invalido');
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
  });

  it('ignora versao ou UUID invalido no storage e volta ao default', () => {
    localStorage.setItem(
      ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
      JSON.stringify({ version: 2, activeTenantId: UUID_B }),
    );
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);

    localStorage.setItem(
      ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
      JSON.stringify({ version: 1, activeTenantId: 'nao-uuid' }),
    );
    expect(getActiveTenantId()).toBe(ISO_PRO_DEFAULT_TENANT_ID);
  });

  it('grava tenant valido', async () => {
    setActiveTenantId(UUID_B);
    expect(getActiveTenantId()).toBe(UUID_B);
    const raw = JSON.parse(localStorage.getItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY)!);
    expect(raw).toEqual({ version: 1, activeTenantId: UUID_B });
    // setActiveTenantId dispara imports dinamicos; aguardar evita
    // EnvironmentTeardownError no CI (import apos teardown do jsdom).
    await vi.dynamicImportSettled();
  });
});
