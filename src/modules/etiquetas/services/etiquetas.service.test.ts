import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { EtiquetaFormData } from '../types/etiqueta.types';
import { atualizarStatusEtiqueta, salvarEtiqueta } from './etiquetas.service';

const STORAGE_KEY = 'iso-pro-desktop-etiquetas';

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

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  carregarRecebimentosCompletos: vi.fn(() => Promise.resolve([])),
}));

function etiquetaForm(overrides: Partial<EtiquetaFormData> = {}): EtiquetaFormData {
  return {
    titulo: 'Etiqueta teste',
    codigo: 'ETQ-TEST',
    descricao: 'Descricao teste',
    modelo: 'simples',
    formato: 'a4_2col',
    larguraMm: 100,
    alturaMm: 50,
    moduloOrigem: 'livre',
    referenciaId: '',
    quantidadeCopias: 1,
    criadoPor: 'Tester',
    observacoes: '',
    ...overrides,
  };
}

describe('etiquetas.service / salvarEtiqueta (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({ etiquetas: [] });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito etiquetas.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarEtiqueta(etiquetaForm({ titulo: 'Nova etiqueta' }));

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { etiquetas: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarEtiqueta(etiquetaForm({ titulo: 'Etiqueta nuvem' }));

    expect(result.success).toBe(true);
    expect(result.data?.titulo).toBe('Etiqueta nuvem');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { titulo: string }[];
    expect(local.some((e) => e.titulo === 'Etiqueta nuvem')).toBe(true);
  });

  it('promove etiquetas locais para nuvem quando snapshot vazio', async () => {
    const localOnly = [
      {
        id: 'etq-local-1',
        titulo: 'So no PC',
        codigo: 'LOC-1',
        descricao: 'x',
        modelo: 'simples',
        formato: 'a4_2col',
        larguraMm: 100,
        alturaMm: 50,
        moduloOrigem: 'livre',
        referenciaId: '',
        quantidadeCopias: 1,
        status: 'pronta',
        criadoPor: 'Tester',
        dataCriacao: '2026-05-01T10:00:00.000Z',
        observacoes: '',
      },
    ];
    store[STORAGE_KEY] = JSON.stringify(localOnly);
    mockReadPayload.mockResolvedValue({ etiquetas: [] });
    mockReadForWrite.mockResolvedValue({
      payload: { etiquetas: [] },
      baselineUpdatedAt: null,
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    mockReadPayload.mockResolvedValueOnce({ etiquetas: [] }).mockResolvedValueOnce({ etiquetas: localOnly });

    const result = await salvarEtiqueta(etiquetaForm({ titulo: 'Outra' }));

    expect(result.success).toBe(true);
    expect(mockCommitWrite).toHaveBeenCalled();
  });
});

describe('etiquetas.service / atualizarStatusEtiqueta (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({
      etiquetas: [
        {
          id: 'etq-1',
          titulo: 'Existente',
          codigo: 'E1',
          descricao: 'd',
          modelo: 'simples',
          formato: 'a4_2col',
          larguraMm: 100,
          alturaMm: 50,
          moduloOrigem: 'livre',
          referenciaId: '',
          quantidadeCopias: 1,
          status: 'pronta',
          criadoPor: 'Admin',
          dataCriacao: '2026-05-01T10:00:00.000Z',
          observacoes: '',
        },
      ],
    });
    mockReadForWrite.mockResolvedValue({
      payload: { etiquetas: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });
  });

  it('atualiza status com gravacao remota', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await atualizarStatusEtiqueta('etq-1', 'impressa');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('impressa');
  });
});
