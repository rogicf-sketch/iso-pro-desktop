/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

const mockHasSupabaseConfig = vi.fn();
const mockGetSupabase = vi.fn();
const mockGetActiveTenantId = vi.fn(() => TENANT_ID);

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: () => mockGetActiveTenantId(),
}));

vi.mock('../../../lib/writePolicy', () => ({
  isBusinessLocalWriteBlocked: () => false,
}));

import {
  getMobileDeviceIndicators,
  listMobileDevices,
  testSupabaseDispositivosMobile,
} from './mobileDevices.service';

function mockSelectChain(rows: unknown[], error: { message: string } | null) {
  const order = vi.fn().mockResolvedValue({ data: rows, error });
  const eqTenant = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq: eqTenant });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eqTenant, order };
}

describe('mobileDevices.service — tenant na nuvem', () => {
  beforeEach(() => {
    mockHasSupabaseConfig.mockReset();
    mockGetSupabase.mockReset();
    mockGetActiveTenantId.mockReturnValue(TENANT_ID);
    localStorage.removeItem('iso-pro-desktop-mobile-devices');
  });

  it('listMobileDevices filtra por tenant_id activo', async () => {
    mockHasSupabaseConfig.mockReturnValue(true);
    const remoteRow = {
      id: 'd1',
      device_id: 'dev-1',
      nome_aparelho: 'Aparelho teste',
      usuario_login: 'u',
      usuario_nome: 'U',
      plataforma: 'android',
      modelo: 'M',
      versao_app: '1',
      autorizado: true,
      bloqueado: false,
      ultimo_acesso_em: '2026-05-01T10:00:00.000Z',
      created_at: '2026-05-01T09:00:00.000Z',
    };
    const { from, eqTenant } = mockSelectChain([remoteRow], null);
    mockGetSupabase.mockReturnValue({ from });

    const r = await listMobileDevices({
      busca: '',
      status: 'todos',
      page: 1,
      pageSize: 10,
    });

    expect(r.source).toBe('supabase');
    expect(r.warning).toBeNull();
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.deviceId).toBe('dev-1');
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(from).toHaveBeenCalledWith('dispositivos_mobile');
  });

  it('listMobileDevices faz fallback local quando Supabase falha', async () => {
    mockHasSupabaseConfig.mockReturnValue(true);
    const { from } = mockSelectChain([], { message: 'JWT expired' });
    mockGetSupabase.mockReturnValue({ from });

    const r = await listMobileDevices({
      busca: '',
      status: 'todos',
      page: 1,
      pageSize: 50,
    });

    expect(r.source).toBe('local');
    expect(r.warning).toMatch(/JWT expired/);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  it('getMobileDeviceIndicators usa nuvem quando disponivel', async () => {
    mockHasSupabaseConfig.mockReturnValue(true);
    const { from } = mockSelectChain([], null);
    mockGetSupabase.mockReturnValue({ from });

    const ind = await getMobileDeviceIndicators();
    expect(ind.source).toBe('supabase');
    expect(ind.warning).toBeNull();
  });

  it('testSupabaseDispositivosMobile conta com eq tenant_id', async () => {
    const eqTenant = vi.fn().mockResolvedValue({ error: null, count: 3 });
    const select = vi.fn().mockReturnValue({ eq: eqTenant });
    const from = vi.fn().mockReturnValue({ select });
    mockGetSupabase.mockReturnValue({ from });

    const r = await testSupabaseDispositivosMobile();
    expect(r.ok).toBe(true);
    expect(r.message).toContain('3');
    expect(eqTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID);
  });
});
