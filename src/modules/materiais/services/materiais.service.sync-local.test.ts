/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'iso-pro-desktop-materiais';

const supabaseMock = vi.hoisted(() => {
  const remoteRows = [
    {
      id: 1,
      codigo: 'REM-1',
      codigo_barras: '7899999000019',
      descricao: 'Da nuvem',
      diametro: '-',
      disciplina: 'Tubulacao',
      unidade: 'UN',
      peso: 1,
      estoque_minimo: 0,
      ativo: true,
    },
  ];
  const order = vi.fn().mockResolvedValue({ data: remoteRows, error: null });
  const eqTenant = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq: eqTenant });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eqTenant, order };
});

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => true,
  shouldUseCloudMaterials: () => true,
  getSupabase: () => ({ from: supabaseMock.from }),
}));

vi.mock('../../../lib/isoProSnapshot', () => ({
  readIsoProSnapshotPayload: vi.fn(() => Promise.resolve({})),
  invalidateIsoProSnapshotCache: vi.fn(),
}));

vi.mock('../../estoque/saldoFromSnapshot', () => ({
  buildSaldoMap: vi.fn(() => new Map()),
  codigoMaterialKey: (c: string) => c.trim().toLowerCase(),
}));

vi.mock('../../auth/services/auth.service', () => ({
  getCurrentUser: vi.fn(() => ({ login: 'tester' })),
}));

vi.mock('../../auth/services/authAudit.service', () => ({
  appendAuthAuditEvent: vi.fn(),
}));

import { sincronizarMateriaisNuvemParaArmazenamentoLocal } from './materiais.service';

describe('sincronizarMateriaisNuvemParaArmazenamentoLocal', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      } as Storage,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('grava copia local com saldo e total da nuvem', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);
    const r = await sincronizarMateriaisNuvemParaArmazenamentoLocal({ actorLogin: 'tester' });
    expect(r.success).toBe(true);
    expect(r.data?.total).toBe(1);
    const raw = JSON.parse(store[STORAGE_KEY] ?? '[]') as { codigo: string }[];
    expect(raw).toHaveLength(1);
    expect(raw[0].codigo).toBe('REM-1');
  });

  it('bloqueia quando local tem mais linhas que a lista da nuvem', async () => {
    store[STORAGE_KEY] = JSON.stringify([{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]);
    const r = await sincronizarMateriaisNuvemParaArmazenamentoLocal({});
    expect(r.success).toBe(false);
    expect(r.meta?.syncMateriaisLocalBloqueado).toBe(true);
    expect(JSON.parse(store[STORAGE_KEY] ?? '[]')).toHaveLength(3);
  });

  it('forcar ignora bloqueio e substitui', async () => {
    store[STORAGE_KEY] = JSON.stringify([{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]);
    const r = await sincronizarMateriaisNuvemParaArmazenamentoLocal({ forcar: true });
    expect(r.success).toBe(true);
    const raw = JSON.parse(store[STORAGE_KEY] ?? '[]') as { codigo: string }[];
    expect(raw).toHaveLength(1);
    expect(raw[0].codigo).toBe('REM-1');
  });
});
