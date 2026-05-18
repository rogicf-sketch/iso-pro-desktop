import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { Recebimento, RecebimentoFormData } from '../types/recebimento.types';
import {
  cancelarRecebimento,
  destravarRecebimentoParaCorrecaoAdministrativa,
  excluirRecebimentosDefinitivamente,
  finalizarConferenciaRecebimento,
  salvarRecebimento,
} from './recebimentos.service';

const STORAGE_KEY = 'iso-pro-desktop-recebimentos';
const MATERIAIS_KEY = 'iso-pro-desktop-materiais';

function seedMateriaisAtivosNoArmazenamento(storage: Record<string, string>, codigos: string[]) {
  storage[MATERIAIS_KEY] = JSON.stringify(
    codigos.map((codigo, i) => ({
      id: `mat-seed-${i}`,
      codigo,
      codigoBarras: '',
      descricao: 'Teste',
      diametro: '',
      disciplina: 'Geral',
      unidade: 'UN',
      peso: 0,
      estoqueMinimo: 0,
      saldoAtual: 0,
      ativo: true,
      observacao: '',
    })),
  );
}

const { mockReadPayload, mockReadForWrite, mockCommitWrite } = vi.hoisted(() => ({
  mockReadPayload: vi.fn(),
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  shouldUseCloudMaterials: vi.fn(() => false),
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

function snapshotRecebimentoAntigo() {
  return {
    fornecedores: [
      {
        id: 'for-a',
        nome: 'Forn A',
        cnpj: '',
        telefone: '',
        email: '',
        endereco: '',
        ativo: true,
      },
    ],
    recebimentos: [
      {
        id: 'rec-edit',
        data: '2026-04-02',
        fornecedorNome: 'Forn A',
        nota: 'NF-1',
        romaneio: 'R-1',
        conferenteNome: 'Conf',
        observacoes: 'Antigo',
        modoRecebimento: 'aguardando_conferencia' as const,
        statusConferencia: 'pendente' as const,
        itens: [
          {
            codigo: 'C1',
            descricao: 'Mat',
            unidade: 'UN',
            disciplina: 'D',
            localizacao: 'S1',
            quantidade: 10,
            quantidadeConferida: 0,
          },
        ],
      },
    ],
  };
}

function snapshotParaConferencia() {
  return {
    recebimentos: [
      {
        id: 'rec-conf',
        data: '2026-04-03',
        fornecedorNome: 'Forn Conf',
        nota: 'NF-9',
        romaneio: 'R-9',
        conferenteNome: 'Conf inicial',
        observacoes: '',
        modoRecebimento: 'aguardando_conferencia' as const,
        statusConferencia: 'pendente' as const,
        itens: [
          {
            codigo: 'CX',
            descricao: 'Item conf',
            unidade: 'UN',
            disciplina: 'D',
            localizacao: 'S2',
            quantidade: 10,
            quantidadeConferida: 0,
          },
        ],
      },
    ],
  };
}

function minimalForm(overrides: Partial<RecebimentoFormData> = {}): RecebimentoFormData {
  return {
    fornecedor: 'Forn A',
    dataRecebimento: '2026-04-02',
    notaFiscal: 'NF-1',
    romaneio: 'R-1',
    conferente: 'Conf',
    modoRecebimento: 'aguardando_conferencia',
    observacoes: 'Antigo',
    itens: [
      {
        id: 'rec-edit-item-1',
        codigoMaterial: 'C1',
        descricaoMaterial: 'Mat',
        unidade: 'UN',
        disciplina: 'D',
        localizacao: 'S1',
        quantidadeRecebida: 10,
        quantidadeConferida: 0,
        pesoUnitario: 0,
        pesoTotal: 0,
      },
    ],
    ...overrides,
  };
}

describe('recebimentos.service / salvarRecebimento (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotRecebimentoAntigo());
    seedMateriaisAtivosNoArmazenamento(store, ['C1']);
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Versao desatualizada.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRecebimento(minimalForm({ observacoes: 'Nova obs' }), 'rec-edit');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Versao desatualizada.');
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { recebimentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRecebimento(minimalForm({ observacoes: 'Sincronizado' }), 'rec-edit');

    expect(result.success).toBe(true);
    expect(result.data?.observacoes).toBe('Sincronizado');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; observacoes: string }[];
    expect(local.some((r) => r.id === 'rec-edit' && r.observacoes === 'Sincronizado')).toBe(true);
  });
});

function formNovoRecebimentoDireto(): RecebimentoFormData {
  return {
    fornecedor: 'Forn Criacao',
    dataRecebimento: '2026-08-15',
    notaFiscal: 'NF-CREATE-1',
    romaneio: 'ROM-CREATE-1',
    conferente: '',
    modoRecebimento: 'direto',
    observacoes: 'Novo recebimento teste',
    itens: [
      {
        id: 'rec-new-item-1',
        codigoMaterial: 'Z9',
        descricaoMaterial: 'Material novo',
        unidade: 'UN',
        disciplina: 'Geral',
        localizacao: 'S3',
        quantidadeRecebida: 3,
        quantidadeConferida: 3,
        pesoUnitario: 0,
        pesoTotal: 0,
      },
    ],
  };
}

describe('recebimentos.service / salvarRecebimento criacao (Supabase)', () => {
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
      recebimentos: [],
      fornecedores: [
        {
          id: 'for-criacao',
          nome: 'Forn Criacao',
          cnpj: '',
          telefone: '',
          email: '',
          endereco: '',
          ativo: true,
        },
      ],
    });
    seedMateriaisAtivosNoArmazenamento(store, ['Z9']);
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao criar recebimento.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRecebimento(formNovoRecebimentoDireto());

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { recebimentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRecebimento(formNovoRecebimentoDireto());

    expect(result.success).toBe(true);
    expect(result.data?.fornecedor).toBe('Forn Criacao');
    expect(result.data?.status).toBe('conferido');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { notaFiscal: string }[];
    expect(local.some((r) => r.notaFiscal === 'NF-CREATE-1')).toBe(true);
  });
});

describe('recebimentos.service / finalizarConferenciaRecebimento (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotParaConferencia());
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito na conferencia.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await finalizarConferenciaRecebimento({
      id: 'rec-conf',
      conferente: 'Maria',
      observacoes: 'Ok',
      itens: [{ id: 'rec-conf-item-1', quantidadeConferida: 10 }],
    });

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito na conferencia.');
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local com status atualizado', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { recebimentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await finalizarConferenciaRecebimento({
      id: 'rec-conf',
      conferente: 'Maria',
      observacoes: 'Conferido',
      itens: [{ id: 'rec-conf-item-1', quantidadeConferida: 10 }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('conferido');
    expect(result.data?.modoRecebimento).toBe('aguardando_conferencia');
    expect(result.data?.conferente).toBe('Maria');

    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as Recebimento[];
    const saved = local.find((r) => r.id === 'rec-conf');
    expect(saved?.status).toBe('conferido');
    expect(saved?.modoRecebimento).toBe('aguardando_conferencia');
    expect(saved?.itens[0]?.quantidadeConferida).toBe(10);
  });
});

function snapshotParaCancelamento() {
  return {
    recebimentos: [
      {
        id: 'rec-cancel',
        data: '2026-04-04',
        fornecedorNome: 'Forn Z',
        nota: 'NF-Z',
        romaneio: 'R-Z',
        conferenteNome: 'Conf',
        observacoes: 'obs',
        modoRecebimento: 'aguardando_conferencia' as const,
        statusConferencia: 'pendente' as const,
        itens: [
          {
            codigo: 'Z1',
            descricao: 'Item Z',
            unidade: 'UN',
            disciplina: 'D',
            localizacao: 'S4',
            quantidade: 5,
            quantidadeConferida: 0,
          },
        ],
      },
    ],
  };
}

describe('recebimentos.service / cancelarRecebimento (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotParaCancelamento());
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao cancelar.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await cancelarRecebimento('rec-cancel');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito ao cancelar.');
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local com status cancelado', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { recebimentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await cancelarRecebimento('rec-cancel');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('cancelado');

    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as Recebimento[];
    expect(local.find((r) => r.id === 'rec-cancel')?.status).toBe('cancelado');
  });
});

function snapshotRecebimentoConferidoParaDestravar() {
  return {
    recebimentos: [
      {
        id: 'rec-destravar',
        data: '2026-04-07',
        fornecedorNome: 'Forn C',
        nota: 'NF-D',
        romaneio: 'R-D',
        conferenteNome: 'Conf',
        observacoes: '',
        modoRecebimento: 'direto' as const,
        statusConferencia: 'conferido' as const,
        itens: [
          {
            codigo: 'D1',
            descricao: 'Item D',
            unidade: 'UN',
            disciplina: 'D',
            localizacao: 'S9',
            quantidade: 10,
            quantidadeConferida: 10,
          },
        ],
      },
    ],
  };
}

describe('recebimentos.service / destravarRecebimentoParaCorrecaoAdministrativa (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotRecebimentoConferidoParaDestravar());
    mockReadForWrite.mockResolvedValue({
      payload: { recebimentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });
  });

  it('em sucesso remoto mantém quantidades conferidas e remove dataConferencia para permitir correcao', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await destravarRecebimentoParaCorrecaoAdministrativa('rec-destravar');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('aguardando_conferencia');
    expect(result.data?.itens[0]?.quantidadeConferida).toBe(10);
    expect(result.data?.dataConferencia).toBeUndefined();

    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as Recebimento[];
    const row = local.find((r) => r.id === 'rec-destravar');
    expect(row?.status).toBe('aguardando_conferencia');
    expect(row?.modoRecebimento).toBe('aguardando_conferencia');
    expect(row?.itens[0]?.quantidadeConferida).toBe(10);
    expect(row?.dataConferencia).toBeUndefined();
  });

  it('recusa destravar recebimento que ja esta aguardando conferencia', async () => {
    mockReadPayload.mockResolvedValue(snapshotParaCancelamento());

    const result = await destravarRecebimentoParaCorrecaoAdministrativa('rec-cancel');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/destravar|aguardando/i);
  });
});

function snapshotDoisRecebimentosAguardando() {
  return {
    recebimentos: [
      ...snapshotParaCancelamento().recebimentos,
      {
        id: 'rec-del-2',
        data: '2026-04-05',
        fornecedorNome: 'Forn B',
        nota: 'NF-B',
        romaneio: 'R-B',
        conferenteNome: 'Conf',
        observacoes: '',
        modoRecebimento: 'aguardando_conferencia' as const,
        statusConferencia: 'pendente' as const,
        itens: [
          {
            codigo: 'B1',
            descricao: 'Item B',
            unidade: 'UN',
            disciplina: 'D',
            localizacao: 'S5',
            quantidade: 2,
            quantidadeConferida: 0,
          },
        ],
      },
    ],
  };
}

describe('recebimentos.service / excluirRecebimentosDefinitivamente (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotDoisRecebimentosAguardando());
    mockReadForWrite.mockResolvedValue({
      payload: { recebimentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });
  });

  it('remove varios recebimentos aguardando conferencia numa unica gravacao', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await excluirRecebimentosDefinitivamente(['rec-cancel', 'rec-del-2']);

    expect(result.success).toBe(true);
    expect(result.data?.removidos).toBe(2);
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string }[];
    expect(local.length).toBe(0);
  });

  it('recusa exclusao se houver recebimento conferido na selecao', async () => {
    mockReadPayload.mockResolvedValue({
      recebimentos: [
        {
          id: 'rec-conf-only',
          data: '2026-04-06',
          fornecedorNome: 'F',
          nota: 'N',
          romaneio: 'R',
          conferenteNome: 'C',
          observacoes: '',
          modoRecebimento: 'aguardando_conferencia' as const,
          statusConferencia: 'conferido' as const,
          itens: [
            {
              codigo: 'X',
              descricao: 'I',
              unidade: 'UN',
              disciplina: 'D',
              localizacao: 'L',
              quantidade: 1,
              quantidadeConferida: 1,
            },
          ],
        },
      ],
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await excluirRecebimentosDefinitivamente(['rec-conf-only']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('conferid');
  });
});
