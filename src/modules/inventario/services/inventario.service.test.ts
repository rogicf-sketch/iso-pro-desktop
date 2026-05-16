import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { InventarioFormData } from '../types/inventario.types';
import { fecharInventario, montarExportacaoInventarioCsv, salvarInventario } from './inventario.service';

const STORAGE_KEY = 'iso-pro-desktop-inventarios';

const { mockReadPayload, mockReadForWrite, mockCommitWrite } = vi.hoisted(() => ({
  mockReadPayload: vi.fn(),
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
}));

vi.mock('../../../lib/isoProSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/isoProSnapshot')>();
  return {
    ...actual,
    readIsoProSnapshotPayload: mockReadPayload,
    readIsoProSnapshotPayloadForWrite: mockReadForWrite,
    commitIsoProSnapshotWrite: mockCommitWrite,
  };
});

function minimalInventario(overrides: Partial<InventarioFormData> = {}): InventarioFormData {
  return {
    codigo: 'INV-NOVO-TEST',
    descricao: 'Inventario teste',
    responsavel: 'Resp',
    dataInventario: '2026-05-01',
    contagemMobileHabilitada: false,
    observacoes: 'obs',
    itens: [
      {
        id: 'inv-item-1',
        codigoMaterial: 'MAT-X',
        descricaoMaterial: 'Material X',
        unidade: 'UN',
        saldoSistema: 10,
        quantidadeContada: 10,
      },
    ],
    ...overrides,
  };
}

describe('inventario.service / salvarInventario criacao (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
    mockReadPayload.mockResolvedValue({ inventarios: [] });
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito inventario.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarInventario(minimalInventario());

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local com status aberto', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { inventarios: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarInventario(minimalInventario({ codigo: 'INV-CREATE-OK' }));

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('aberto');
    expect(result.data?.codigo).toBe('INV-CREATE-OK');

    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { codigo: string; status: string }[];
    expect(local.some((inv) => inv.codigo === 'INV-CREATE-OK' && inv.status === 'aberto')).toBe(true);
  });
});

function snapshotInventarioAbertoEdicao() {
  return {
    inventarios: [
      {
        id: 'inv-edit',
        codigo: 'INV-ED',
        descricao: 'Antiga',
        responsavel: 'R1',
        dataInventario: '2026-06-01',
        status: 'aberto' as const,
        contagemMobileHabilitada: false,
        observacoes: '',
        itens: [
          {
            id: 'inv-ed-item-1',
            codigoMaterial: 'M1',
            descricaoMaterial: 'Mat',
            unidade: 'UN',
            saldoSistema: 4,
            quantidadeContada: 4,
          },
        ],
      },
    ],
  };
}

describe('inventario.service / salvarInventario edicao (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
    mockReadPayload.mockResolvedValue(snapshotInventarioAbertoEdicao());
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito edicao inv.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarInventario(
      minimalInventario({
        codigo: 'INV-ED',
        descricao: 'Nova desc',
        responsavel: 'R1',
        dataInventario: '2026-06-01',
        itens: [
          {
            id: 'inv-ed-item-1',
            codigoMaterial: 'M1',
            descricaoMaterial: 'Mat',
            unidade: 'UN',
            saldoSistema: 4,
            quantidadeContada: 4,
          },
        ],
      }),
      'inv-edit',
    );

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto atualiza copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { inventarios: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarInventario(
      minimalInventario({
        codigo: 'INV-ED',
        descricao: 'Desc atualizada',
        responsavel: 'R1',
        dataInventario: '2026-06-01',
        itens: [
          {
            id: 'inv-ed-item-1',
            codigoMaterial: 'M1',
            descricaoMaterial: 'Mat',
            unidade: 'UN',
            saldoSistema: 4,
            quantidadeContada: 4,
          },
        ],
      }),
      'inv-edit',
    );

    expect(result.success).toBe(true);
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; descricao: string }[];
    expect(local.find((i) => i.id === 'inv-edit')?.descricao).toBe('Desc atualizada');
  });
});

describe('inventario.service / fecharInventario (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
    mockReadPayload.mockResolvedValue(snapshotInventarioAbertoEdicao());
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao fechar.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await fecharInventario('inv-edit');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto marca fechado na copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { inventarios: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await fecharInventario('inv-edit');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('fechado');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; status: string }[];
    expect(local.find((i) => i.id === 'inv-edit')?.status).toBe('fechado');
  });
});

describe('inventario.service / montarExportacaoInventarioCsv', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
  });

  it('retorna erro quando inventario nao existe', async () => {
    mockReadPayload.mockResolvedValue({ inventarios: [] });
    const result = await montarExportacaoInventarioCsv('missing-id');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/nao encontrado/i);
  });

  it('retorna erro quando inventario nao esta fechado', async () => {
    mockReadPayload.mockResolvedValue({
      inventarios: [
        {
          id: 'inv-aberto',
          codigo: 'INV-A',
          descricao: 'X',
          responsavel: 'R',
          dataInventario: '2026-01-01',
          status: 'aberto' as const,
          contagemMobileHabilitada: false,
          observacoes: '',
          itens: [
            {
              id: 'i1',
              codigoMaterial: 'M',
              descricaoMaterial: 'Mat',
              unidade: 'UN',
              saldoSistema: 1,
              quantidadeContada: 1,
            },
          ],
        },
      ],
    });
    const result = await montarExportacaoInventarioCsv('inv-aberto');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/fechados/i);
  });

  it('gera csv utf-8 com bom e coluna diferenca', async () => {
    mockReadPayload.mockResolvedValue({
      inventarios: [
        {
          id: 'inv-fech',
          codigo: 'INV-FECH/TEST',
          descricao: 'Desc;com;sep',
          responsavel: 'Resp',
          dataInventario: '2026-02-01',
          status: 'fechado' as const,
          contagemMobileHabilitada: true,
          observacoes: 'Obs',
          itens: [
            {
              id: 'it1',
              codigoMaterial: 'MAT-1',
              descricaoMaterial: 'Material um',
              unidade: 'UN',
              saldoSistema: 10,
              quantidadeContada: 12,
            },
          ],
        },
      ],
    });
    const result = await montarExportacaoInventarioCsv('inv-fech');
    expect(result.success).toBe(true);
    expect(result.data?.fileName).toMatch(/^iso-pro-inventario-INV-FECH_TEST-/);
    const csv = result.data?.csv ?? '';
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('diferenca');
    expect(csv).toContain('MAT-1');
    expect(csv).toContain('2');
  });
});
