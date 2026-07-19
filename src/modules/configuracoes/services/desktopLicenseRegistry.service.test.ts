import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDesktopLicenseRegistrySummary,
  listDesktopLicenseRegistry,
} from './desktopLicenseRegistry.service';

const { mockHasSupabaseConfig, mockGetSupabase } = vi.hoisted(() => ({
  mockHasSupabaseConfig: vi.fn(() => true),
  mockGetSupabase: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: () => 'tenant-1',
}));

type Row = {
  license_id: string;
  issued_to: string;
  machine_fingerprint: string;
  machine_label: string | null;
  app_version: string | null;
  status: 'active' | 'revoked';
  emitida_em: string;
  expira_em: string | null;
  revogada_em: string | null;
  motivo_revogacao: string | null;
};

function fakeSupabaseComRows(rows: Row[] | null, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve({ data: rows, error })),
  };
  return { from: vi.fn(() => query) };
}

function row(partial: Partial<Row>): Row {
  return {
    license_id: 'L1',
    issued_to: 'Obra X',
    machine_fingerprint: 'fp',
    machine_label: 'PC-1',
    app_version: '0.1.132',
    status: 'active',
    emitida_em: '2026-01-01T00:00:00.000Z',
    expira_em: null,
    revogada_em: null,
    motivo_revogacao: null,
    ...partial,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
  mockHasSupabaseConfig.mockReturnValue(true);
  mockGetSupabase.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('listDesktopLicenseRegistry', () => {
  it('devolve fallback local quando Supabase nao esta configurado', async () => {
    mockHasSupabaseConfig.mockReturnValue(false);
    const r = await listDesktopLicenseRegistry();
    expect(r.success).toBe(true);
    expect(r.data).toEqual([]);
    expect(r.meta?.source).toBe('local');
  });

  it('mapeia as linhas do Supabase para o formato do registo', async () => {
    mockGetSupabase.mockReturnValue(
      fakeSupabaseComRows([row({ license_id: 'L9', machine_label: null, app_version: null })]),
    );
    const r = await listDesktopLicenseRegistry();
    expect(r.meta?.source).toBe('supabase');
    expect(r.data?.[0]).toMatchObject({ licenseId: 'L9', machineLabel: '', appVersion: '' });
  });

  it('cai em fallback local (sem lançar) quando a query devolve erro', async () => {
    mockGetSupabase.mockReturnValue(fakeSupabaseComRows(null, { message: 'boom' }));
    const r = await listDesktopLicenseRegistry();
    expect(r.success).toBe(true);
    expect(r.data).toEqual([]);
    expect(r.meta?.source).toBe('local');
  });
});

describe('getDesktopLicenseRegistrySummary', () => {
  it('agrega ativos, revogados, expirados, a expirar e sem etiqueta', async () => {
    const rows: Row[] = [
      row({ license_id: 'ativa-ok', expira_em: '2027-01-01T00:00:00.000Z' }),
      row({ license_id: 'revogada', status: 'revoked' }),
      row({ license_id: 'expirada', expira_em: '2026-01-01T00:00:00.000Z' }),
      row({ license_id: 'a-expirar', expira_em: '2026-08-01T00:00:00.000Z' }),
      row({ license_id: 'sem-label', machine_label: '   ' }),
    ];
    mockGetSupabase.mockReturnValue(fakeSupabaseComRows(rows));

    const r = await getDesktopLicenseRegistrySummary();
    expect(r.success).toBe(true);
    const s = r.data!;
    expect(s.total).toBe(5);
    expect(s.revoked).toBe(1);
    expect(s.active).toBe(4);
    expect(s.expired).toBe(1);
    expect(s.expiringSoon).toBe(1);
    expect(s.missingMachineLabel).toBe(1);
  });

  it('summary de registo vazio devolve zeros', async () => {
    mockGetSupabase.mockReturnValue(fakeSupabaseComRows([]));
    const r = await getDesktopLicenseRegistrySummary();
    expect(r.data).toEqual({
      total: 0,
      active: 0,
      revoked: 0,
      expired: 0,
      expiringSoon: 0,
      missingMachineLabel: 0,
    });
  });
});
