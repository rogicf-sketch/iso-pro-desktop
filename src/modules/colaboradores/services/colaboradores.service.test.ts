import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { ColaboradorFormData } from '../types/colaborador.types';
import {
  montarExportacaoColaboradoresCsv,
  registrarRetiranteExterno,
  salvarColaborador,
  toggleColaboradorStatus,
} from './colaboradores.service';

const STORAGE_KEY = 'iso-pro-desktop-colaboradores';

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

function colaboradorForm(overrides: Partial<ColaboradorFormData> = {}): ColaboradorFormData {
  return {
    nome: 'Colaborador Teste',
    tipo: 'interno',
    matricula: '99999',
    funcao: 'Auxiliar',
    empresa: 'ISO PRO',
    documento: '',
    telefone: '(11) 98888-7777',
    observacao: '',
    ativo: true,
    ...overrides,
  };
}

describe('colaboradores.service / salvarColaborador criacao (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({ colaboradores: [] });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito colaborador.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarColaborador(colaboradorForm({ nome: 'Novo Col' }));

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { colaboradores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarColaborador(colaboradorForm({ nome: 'Maria Nova', matricula: '777' }));

    expect(result.success).toBe(true);
    expect(result.data?.nome).toBe('Maria Nova');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { nome: string }[];
    expect(local.some((c) => c.nome === 'Maria Nova')).toBe(true);
  });
});

describe('colaboradores.service / salvarColaborador edicao (Supabase)', () => {
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
      colaboradores: [
        {
          id: 'col-edit',
          nome: 'Pedro Antigo',
          tipo: 'interno',
          matricula: '100',
          funcao: 'Op',
          empresa: 'ISO PRO',
          documento: '',
          telefone: '(11) 1111-1111',
          observacao: '',
          ativo: true,
        },
      ],
    });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito edicao col.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarColaborador(
      colaboradorForm({
        nome: 'Pedro Antigo',
        matricula: '100',
        funcao: 'Coordenador',
        telefone: '(11) 2222-2222',
      }),
      'col-edit',
    );

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto atualiza copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { colaboradores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarColaborador(
      colaboradorForm({
        nome: 'Pedro Antigo',
        matricula: '100',
        funcao: 'Coordenacao',
        telefone: '(11) 9999-8888',
      }),
      'col-edit',
    );

    expect(result.success).toBe(true);
    expect(result.data?.funcao).toBe('Coordenacao');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; funcao: string }[];
    expect(local.find((c) => c.id === 'col-edit')?.funcao).toBe('Coordenacao');
  });
});

describe('colaboradores.service / toggleColaboradorStatus (Supabase)', () => {
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
      colaboradores: [
        {
          id: 'col-tog',
          nome: 'Toggle Silva',
          tipo: 'interno',
          matricula: '555',
          funcao: 'A',
          empresa: 'ISO PRO',
          documento: '',
          telefone: '(11) 3000-0000',
          observacao: '',
          ativo: true,
        },
      ],
    });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito toggle col.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await toggleColaboradorStatus('col-tog', false);

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto atualiza ativo na copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { colaboradores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await toggleColaboradorStatus('col-tog', false);

    expect(result.success).toBe(true);
    expect(result.data?.ativo).toBe(false);
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; ativo: boolean }[];
    expect(local.find((c) => c.id === 'col-tog')?.ativo).toBe(false);
  });
});

describe('colaboradores.service / registrarRetiranteExterno (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({ colaboradores: [] });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito retirante.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await registrarRetiranteExterno({
      nome: 'Externo Um',
      empresa: 'Empresa Ext',
      documento: 'DOC-999',
      telefone: '(11) 98888-9999',
    });

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto cria retirante externo na copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { colaboradores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await registrarRetiranteExterno({
      nome: 'Externo Dois',
      empresa: 'ACME',
      documento: 'RG-123456',
      telefone: '(21) 97777-6666',
      observacao: 'Teste',
    });

    expect(result.success).toBe(true);
    expect(result.data?.tipo).toBe('externo');
    expect(result.data?.nome).toBe('Externo Dois');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { nome: string; tipo: string }[];
    expect(local.some((c) => c.nome === 'Externo Dois' && c.tipo === 'externo')).toBe(true);
  });
});

describe('colaboradores.service / registrarRetiranteExterno atualiza existente (Supabase)', () => {
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
      colaboradores: [
        {
          id: 'ext-existing',
          nome: 'Externo Legado',
          tipo: 'externo',
          matricula: '',
          funcao: 'Retirante externo',
          empresa: 'Empresa Antiga',
          documento: 'DOC-FIXO-99',
          telefone: '(11) 1000-0000',
          observacao: 'obs velha',
          ativo: true,
        },
      ],
    });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito atualiza retirante.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await registrarRetiranteExterno({
      nome: 'Externo Legado',
      empresa: 'Empresa Nova',
      documento: 'DOC-FIXO-99',
      telefone: '(11) 9999-8888',
    });

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto atualiza mesmo id na copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { colaboradores: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await registrarRetiranteExterno({
      nome: 'Externo Legado',
      empresa: 'Empresa Atualizada',
      documento: 'DOC-FIXO-99',
      telefone: '(11) 3333-4444',
      observacao: 'Atualizado via reteste',
    });

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('ext-existing');
    expect(result.data?.empresa).toBe('Empresa Atualizada');
    expect(result.data?.telefone).toBe('(11) 3333-4444');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; empresa: string }[];
    expect(local.find((c) => c.id === 'ext-existing')?.empresa).toBe('Empresa Atualizada');
  });
});

describe('montarExportacaoColaboradoresCsv (Supabase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadPayload.mockResolvedValue({
      colaboradores: [
        {
          id: 'c1',
          nome: 'Joao Export',
          tipo: 'interno',
          matricula: '1',
          funcao: 'Operador',
          empresa: 'ISO PRO',
          documento: '',
          telefone: '',
          observacao: '',
          ativo: true,
        },
      ],
    });
  });

  it('gera csv com cabecalho e dados', async () => {
    const result = await montarExportacaoColaboradoresCsv();
    expect(result.success).toBe(true);
    expect(result.data?.fileName).toMatch(/^iso-pro-colaboradores-/);
    expect(result.data?.csv).toContain('nome;tipo;matricula');
    expect(result.data?.csv).toContain('Joao Export');
  });
});
