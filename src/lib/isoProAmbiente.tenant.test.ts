/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getScopedIsoProStorageKey,
  getScopedIsoProStorageKeyForAmbienteIdAndTenant,
  isStorageKeyForAmbienteAtivo,
  parseIsoProStorageKey,
} from './isoProAmbiente';
import { ISO_PRO_DEFAULT_TENANT_ID, ISO_PRO_TENANT_CONTEXT_STORAGE_KEY, setActiveTenantId } from './isoProTenant';

const UUID_B = '22222222-2222-2222-2222-222222222222';
const BASE = 'iso-pro-desktop-materiais';

describe('isoProAmbiente / isolamento por tenant', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('tenant default + ambiente padrao mantem chave legada', () => {
    expect(getScopedIsoProStorageKey(BASE)).toBe(BASE);
  });

  it('tenant nao default inclui sufixo ::tenant:', () => {
    localStorage.setItem(
      ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
      JSON.stringify({ version: 1, activeTenantId: UUID_B }),
    );
    expect(getScopedIsoProStorageKey(BASE)).toBe(`${BASE}::tenant:${UUID_B}`);
  });

  it('parseIsoProStorageKey separa tenant e ambiente', () => {
    const key = `${BASE}::tenant:${UUID_B}::ambiente:obra-a`;
    expect(parseIsoProStorageKey(key)).toEqual({
      base: BASE,
      tenantId: UUID_B,
      ambienteId: 'obra-a',
    });
  });

  it('isStorageKeyForAmbienteAtivo filtra chaves de outro tenant', () => {
    localStorage.setItem(
      ISO_PRO_TENANT_CONTEXT_STORAGE_KEY,
      JSON.stringify({ version: 1, activeTenantId: UUID_B }),
    );
    const keyB = getScopedIsoProStorageKeyForAmbienteIdAndTenant(BASE, 'padrao', UUID_B);
    const keyDefault = getScopedIsoProStorageKeyForAmbienteIdAndTenant(BASE, 'padrao', ISO_PRO_DEFAULT_TENANT_ID);
    expect(isStorageKeyForAmbienteAtivo(keyB)).toBe(true);
    expect(isStorageKeyForAmbienteAtivo(keyDefault)).toBe(false);
  });

  it('setActiveTenantId grava tenant activo para chaves scoped', () => {
    setActiveTenantId(UUID_B);
    expect(
      JSON.parse(localStorage.getItem(ISO_PRO_TENANT_CONTEXT_STORAGE_KEY)!).activeTenantId,
    ).toBe(UUID_B);
    expect(getScopedIsoProStorageKey(BASE)).toBe(`${BASE}::tenant:${UUID_B}`);
  });
});
