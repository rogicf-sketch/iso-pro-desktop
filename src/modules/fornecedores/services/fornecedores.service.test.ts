import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { FornecedorFormData } from '../types/fornecedor.types';
import { salvarFornecedor, toggleFornecedorStatus } from './fornecedores.service';

const STORAGE_KEY = 'iso-pro-desktop-fornecedores';

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

function fornecedorForm(overrides: Partial<FornecedorFormData> = {}): FornecedorFormData {
  return {
    nome: 'Fornecedor Teste',
    cnpj: '12.345.678/0001-99',
    telefone: '(11) 4000-0000',
    email: 'contato@teste.com',
    endereco: 'Rua A, 1',
    ativo: true,
    ...overrides,
  };
}

describe('fornecedores.service / salvarFornecedor criacao (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({ fornecedores: [] });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito fornecedor.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarFornecedor(fornecedorForm({ nome: 'Novo Forn' }));

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { fornecedores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarFornecedor(fornecedorForm({ nome: 'Forn Criado SP' }));

    expect(result.success).toBe(true);
    expect(result.data?.nome).toBe('Forn Criado SP');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { nome: string }[];
    expect(local.some((f) => f.nome === 'Forn Criado SP')).toBe(true);
  });
});

describe('fornecedores.service / salvarFornecedor edicao (Supabase)', () => {
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
      fornecedores: [
        {
          id: 'for-edit',
          nome: 'Forn Antigo',
          cnpj: '99.999.999/0001-99',
          telefone: '(21) 9999-9999',
          email: 'old@old.com',
          endereco: 'Old St',
          ativo: true,
        },
      ],
    });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito edicao forn.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarFornecedor(fornecedorForm({ nome: 'Forn Antigo Atualizado' }), 'for-edit');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto atualiza copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { fornecedores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarFornecedor(
      fornecedorForm({
        nome: 'Forn Antigo',
        email: 'novo@email.com',
        cnpj: '99.999.999/0001-99',
        telefone: '(21) 9999-9999',
        endereco: 'Old St',
      }),
      'for-edit',
    );

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('novo@email.com');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; email: string }[];
    expect(local.find((f) => f.id === 'for-edit')?.email).toBe('novo@email.com');
  });
});

describe('fornecedores.service / toggleFornecedorStatus (Supabase)', () => {
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
      fornecedores: [
        {
          id: 'for-tog',
          nome: 'Forn Toggle',
          cnpj: '10.000.000/0001-00',
          telefone: '(11) 1111-1111',
          email: 'tog@example.com',
          endereco: 'X',
          ativo: true,
        },
      ],
    });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito toggle forn.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await toggleFornecedorStatus('for-tog', false);

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto atualiza ativo na copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { fornecedores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await toggleFornecedorStatus('for-tog', false);

    expect(result.success).toBe(true);
    expect(result.data?.ativo).toBe(false);
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; ativo: boolean }[];
    expect(local.find((f) => f.id === 'for-tog')?.ativo).toBe(false);
  });
});
