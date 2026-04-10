import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { estornarAtendimento, montarExportacaoAtendimentosCsvItens, registrarAtendimento } from './atendimento.service';

const DOCUMENTOS_KEY = 'iso-pro-desktop-documentos';
const MATERIAIS_KEY = 'iso-pro-desktop-materiais';
const ATENDIMENTOS_KEY = 'iso-pro-desktop-atendimentos';

const { mockReadPayload, mockReadForWrite, mockCommitWrite } = vi.hoisted(() => ({
  mockReadPayload: vi.fn(),
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  /** Testes usam snapshot mockado; evita cruzar com tabela `materiais` real. */
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

vi.mock('../../colaboradores/services/colaboradores.service', () => ({
  buscarColaboradorPorId: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        id: 'colab-1',
        nome: 'Joao Interno',
        ativo: true,
        tipo: 'interno',
        empresa: 'Empresa X',
        documento: '123',
        telefone: '11987654321',
      },
    }),
  ),
  registrarRetiranteExterno: vi.fn(),
}));

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  consumirSequenciaAtendimento: vi.fn(() => 7),
}));

/** Estado remoto com um atendimento concluido para exercitar estorno. */
function snapshotParaEstorno() {
  return {
    documentos: [
      {
        id: 'doc-est',
        numero: 'DE1',
        revisao: 'A',
        descricao: 'Doc estorno',
        responsavel: 'Resp',
        status: 'parcial',
        itens: [
          {
            id: 'doc-est-item-1',
            codigo: 'M1',
            descricao: 'Material 1',
            unidade: 'UN',
            quantidade: 10,
            quantidadeAtendida: 5,
          },
        ],
      },
    ],
    materiais: [
      {
        id: 'mat-1',
        codigo: 'M1',
        descricao: 'Material 1',
        unidade: 'UN',
        saldoAtual: 95,
      },
    ],
    atendimentos: [
      {
        id: 'atd-est-1',
        numero: 'ATD-EST-1',
        documentoId: 'doc-est',
        documentoNumero: 'DE1',
        atendente: 'Maria',
        recebedorTipo: 'interno',
        recebedorColaboradorId: 'colab-1',
        recebedor: 'Joao Interno',
        recebedorEmpresa: 'Empresa X',
        recebedorDocumento: '123',
        recebedorTelefone: '11987654321',
        autorizadorInterno: '',
        motivoRetirada: '',
        origem: 'windows',
        status: 'concluido',
        dataAtendimento: '2026-04-01T12:00:00.000Z',
        itens: [
          {
            id: 'lote-item-1',
            documentoItemId: 'doc-est-item-1',
            materialId: 'mat-1',
            codigoMaterial: 'M1',
            descricaoMaterial: 'Material 1',
            unidade: 'UN',
            quantidadeAtendida: 5,
          },
        ],
      },
    ],
    atendimentoHistorico: [],
  };
}

function snapshotAtendimentoBase() {
  return {
    documentos: [
      {
        id: 'doc-atd',
        numero: 'D1',
        revisao: 'A',
        descricao: 'Doc teste',
        responsavel: 'Resp',
        status: 'pendente',
        itens: [
          {
            id: 'doc-atd-item-1',
            codigo: 'M1',
            descricao: 'Material 1',
            unidade: 'UN',
            quantidade: 10,
            quantidadeAtendida: 0,
          },
        ],
      },
    ],
    materiais: [
      {
        id: 'mat-1',
        codigo: 'M1',
        descricao: 'Material 1',
        unidade: 'UN',
        saldoAtual: 100,
      },
    ],
    atendimentos: [],
    atendimentoHistorico: [],
  };
}

/** Linhas ja fechadas, mas `status` do snapshot pode estar desatualizado (ex.: recebido vs atendido). */
function snapshotDocumentoSemSaldoPendente() {
  return {
    documentos: [
      {
        id: 'doc-cheio',
        numero: 'DC1',
        revisao: 'A',
        descricao: 'Sem saldo',
        responsavel: 'R',
        status: 'recebido',
        itens: [
          {
            id: 'doc-cheio-i1',
            codigo: 'M1',
            descricao: 'Material 1',
            unidade: 'UN',
            quantidade: 10,
            quantidadeAtendida: 10,
          },
        ],
      },
    ],
    materiais: [
      {
        id: 'mat-1',
        codigo: 'M1',
        descricao: 'Material 1',
        unidade: 'UN',
        saldoAtual: 100,
      },
    ],
    atendimentos: [],
    atendimentoHistorico: [],
  };
}

describe('atendimento.service / registrarAtendimento (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotAtendimentoBase());
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao registrar atendimento.'));

    store[DOCUMENTOS_KEY] = JSON.stringify([]);
    store[MATERIAIS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);

    const result = await registrarAtendimento({
      documentoId: 'doc-atd',
      atendente: 'Maria',
      recebedorTipo: 'interno',
      recebedorColaboradorId: 'colab-1',
      recebedor: '',
      itens: [{ documentoItemId: 'doc-atd-item-1', quantidade: 2 }],
    });

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito ao registrar atendimento.');
    expect(store[DOCUMENTOS_KEY]).toBe(JSON.stringify([]));
    expect(store[MATERIAIS_KEY]).toBe(JSON.stringify([]));
    expect(store[ATENDIMENTOS_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste documentos, materiais e atendimentos localmente', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: {},
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[DOCUMENTOS_KEY] = JSON.stringify([]);
    store[MATERIAIS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);

    const result = await registrarAtendimento({
      documentoId: 'doc-atd',
      atendente: 'Maria',
      recebedorTipo: 'interno',
      recebedorColaboradorId: 'colab-1',
      recebedor: '',
      itens: [{ documentoItemId: 'doc-atd-item-1', quantidade: 3 }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.documentoId).toBe('doc-atd');
    expect(result.data?.itens[0]?.quantidadeAtendida).toBe(3);

    const documentos = JSON.parse(store[DOCUMENTOS_KEY] ?? '[]') as Array<{
      id: string;
      itens: Array<{ id: string; quantidadeAtendida: number }>;
    }>;
    const doc = documentos.find((d) => d.id === 'doc-atd');
    expect(doc?.itens[0]?.quantidadeAtendida).toBe(3);

    const materiais = JSON.parse(store[MATERIAIS_KEY] ?? '[]') as Array<{ codigo: string; saldoAtual?: number }>;
    const mat = materiais.find((m) => m.codigo === 'M1');
    expect(mat?.saldoAtual).toBe(97);

    const atendimentos = JSON.parse(store[ATENDIMENTOS_KEY] ?? '[]') as Array<{ documentoId: string }>;
    expect(atendimentos.some((a) => a.documentoId === 'doc-atd')).toBe(true);
  });

  it('nao registra atendimento quando nao ha quantidade pendente nas linhas do documento', async () => {
    mockReadPayload.mockResolvedValue(snapshotDocumentoSemSaldoPendente());

    const result = await registrarAtendimento({
      documentoId: 'doc-cheio',
      atendente: 'Maria',
      recebedorTipo: 'interno',
      recebedorColaboradorId: 'colab-1',
      recebedor: '',
      itens: [{ documentoItemId: 'doc-cheio-i1', quantidade: 1 }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('DC1');
    expect(result.error).toContain('rev.');
    expect(result.error).toContain('saldo pendente');
    expect(mockCommitWrite).not.toHaveBeenCalled();
  });
});

describe('atendimento.service / estornarAtendimento (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue(snapshotParaEstorno());
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao estornar.'));

    store[DOCUMENTOS_KEY] = JSON.stringify([{ id: 'local-only' }]);
    store[MATERIAIS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);

    const result = await estornarAtendimento('atd-est-1');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito ao estornar.');
    expect(store[DOCUMENTOS_KEY]).toBe(JSON.stringify([{ id: 'local-only' }]));
  });

  it('em sucesso reverte quantidades no documento e material e marca estorno', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: {},
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[DOCUMENTOS_KEY] = JSON.stringify([]);
    store[MATERIAIS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);

    const result = await estornarAtendimento('atd-est-1');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('estornado');

    const documentos = JSON.parse(store[DOCUMENTOS_KEY] ?? '[]') as Array<{
      id: string;
      status: string;
      itens: Array<{ quantidadeAtendida: number }>;
    }>;
    const doc = documentos.find((d) => d.id === 'doc-est');
    expect(doc?.itens[0]?.quantidadeAtendida).toBe(0);
    expect(doc?.status).toBe('pendente');

    const materiais = JSON.parse(store[MATERIAIS_KEY] ?? '[]') as Array<{ codigo: string; saldoAtual?: number }>;
    expect(materiais.find((m) => m.codigo === 'M1')?.saldoAtual).toBe(100);

    const atendimentos = JSON.parse(store[ATENDIMENTOS_KEY] ?? '[]') as Array<{ id: string; status: string }>;
    expect(atendimentos.find((a) => a.id === 'atd-est-1')?.status).toBe('estornado');
  });

  it('estorno parcial mantem lote concluido e ajusta apenas itens selecionados', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: {},
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    mockReadPayload.mockResolvedValue({
      documentos: [
        {
          id: 'doc-est-p',
          numero: 'DEP',
          revisao: 'A',
          descricao: 'Doc parcial',
          responsavel: 'Resp',
          status: 'parcial',
          itens: [
            {
              id: 'doc-est-p-i1',
              codigo: 'M1',
              descricao: 'Material 1',
              unidade: 'UN',
              quantidade: 10,
              quantidadeAtendida: 5,
            },
            {
              id: 'doc-est-p-i2',
              codigo: 'M2',
              descricao: 'Material 2',
              unidade: 'PC',
              quantidade: 10,
              quantidadeAtendida: 3,
            },
          ],
        },
      ],
      materiais: [
        { id: 'mat-1', codigo: 'M1', descricao: 'Material 1', unidade: 'UN', saldoAtual: 95 },
        { id: 'mat-2', codigo: 'M2', descricao: 'Material 2', unidade: 'PC', saldoAtual: 97 },
      ],
      atendimentos: [
        {
          id: 'atd-est-p',
          numero: 'ATD-P',
          documentoId: 'doc-est-p',
          documentoNumero: 'DEP',
          atendente: 'Op',
          recebedorTipo: 'interno',
          recebedorColaboradorId: 'c1',
          recebedor: 'R1',
          recebedorEmpresa: '',
          recebedorDocumento: '',
          recebedorTelefone: '',
          autorizadorInterno: '',
          motivoRetirada: '',
          origem: 'windows',
          status: 'concluido',
          dataAtendimento: '2026-04-01T12:00:00.000Z',
          itens: [
            {
              id: 'lote-p-a',
              documentoItemId: 'doc-est-p-i1',
              materialId: 'mat-1',
              codigoMaterial: 'M1',
              descricaoMaterial: 'Material 1',
              unidade: 'UN',
              quantidadeAtendida: 5,
            },
            {
              id: 'lote-p-b',
              documentoItemId: 'doc-est-p-i2',
              materialId: 'mat-2',
              codigoMaterial: 'M2',
              descricaoMaterial: 'Material 2',
              unidade: 'PC',
              quantidadeAtendida: 3,
            },
          ],
        },
      ],
      atendimentoHistorico: [],
    });

    store[DOCUMENTOS_KEY] = JSON.stringify([]);
    store[MATERIAIS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);

    const result = await estornarAtendimento('atd-est-p', [{ atendimentoItemId: 'lote-p-a', quantidade: 5 }]);

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('concluido');
    expect(result.data?.itens?.length).toBe(1);
    expect(result.data?.itens?.[0].id).toBe('lote-p-b');

    const documentos = JSON.parse(store[DOCUMENTOS_KEY] ?? '[]') as Array<{
      id: string;
      itens: Array<{ id: string; quantidadeAtendida: number }>;
    }>;
    const doc = documentos.find((d) => d.id === 'doc-est-p');
    expect(doc?.itens.find((i) => i.id === 'doc-est-p-i1')?.quantidadeAtendida).toBe(0);
    expect(doc?.itens.find((i) => i.id === 'doc-est-p-i2')?.quantidadeAtendida).toBe(3);
  });
});

describe('atendimento.service / montarExportacaoAtendimentosCsvItens', () => {
  let store: Record<string, string>;

  afterEach(() => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
  });

  beforeEach(() => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(false);
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

  it('gera CSV com cabecalho e uma linha por item de material', async () => {
    store[DOCUMENTOS_KEY] = JSON.stringify([
      {
        id: 'd-exp',
        numero: 'DEX',
        revisao: 'B',
        descricao: 'Documento export',
        responsavel: 'RespExp',
        status: 'parcial',
        itens: [],
      },
    ]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([
      {
        id: 'atd-exp-1',
        numero: 'ATD-EXP-1',
        documentoId: 'd-exp',
        documentoNumero: 'DEX',
        atendente: 'Operador',
        recebedorTipo: 'interno',
        recebedorColaboradorId: 'c1',
        recebedor: 'Recebe',
        recebedorEmpresa: '',
        recebedorDocumento: '',
        recebedorTelefone: '',
        autorizadorInterno: '',
        motivoRetirada: '',
        origem: 'windows',
        status: 'concluido',
        dataAtendimento: '2026-05-01T10:00:00.000Z',
        itens: [
          {
            id: 'item-exp-1',
            documentoItemId: 'di-exp',
            materialId: null,
            codigoMaterial: 'COD-X',
            descricaoMaterial: 'Material export',
            unidade: 'PC',
            quantidadeAtendida: 4,
          },
        ],
      },
    ]);

    const result = await montarExportacaoAtendimentosCsvItens();

    expect(result.success).toBe(true);
    expect(result.data?.fileName).toMatch(/^iso-pro-atendimentos-materiais-/);
    expect(result.data?.csv).toContain('lote_numero');
    expect(result.data?.csv).toContain('ATD-EXP-1');
    expect(result.data?.csv).toContain('Documento export');
    expect(result.data?.csv).toContain('COD-X');
    expect(result.data?.csv).toContain('atendido');
    expect(result.data?.csv).toContain('estorno_permitido');
    expect(result.data?.csv).toContain('qtd_pode_estornar');
    expect(result.data?.csv).toContain('pode_estornar_linha');
    expect(result.data?.csv).toContain('PC (Windows)');
  });

  it('inclui lote totalmente estornado (itens vazios) com linha resumo no CSV', async () => {
    store[DOCUMENTOS_KEY] = JSON.stringify([
      {
        id: 'd-est',
        numero: 'D-EST',
        revisao: '1',
        descricao: 'Doc est',
        responsavel: 'R',
        status: 'parcial',
        itens: [],
      },
    ]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([
      {
        id: 'atd-est-total',
        numero: 'ATD-20260403-0001',
        documentoId: 'd-est',
        documentoNumero: 'D-EST',
        atendente: 'Op',
        recebedorTipo: 'interno',
        recebedorColaboradorId: 'c1',
        recebedor: '',
        recebedorEmpresa: '',
        recebedorDocumento: '',
        recebedorTelefone: '',
        autorizadorInterno: '',
        motivoRetirada: '',
        origem: 'windows',
        status: 'estornado',
        dataAtendimento: '2026-04-03T20:00:00.000Z',
        itens: [],
      },
    ]);

    const result = await montarExportacaoAtendimentosCsvItens();

    expect(result.success).toBe(true);
    expect(result.data?.csv).toContain('ATD-20260403-0001');
    expect(result.data?.csv).toContain('estornado');
    expect(result.data?.csv).toContain('Lote totalmente estornado');
    const linhaLote = result.data!.csv.split(/\r?\n/).find((l) => l.includes('ATD-20260403-0001'));
    expect(linhaLote).toBeDefined();
    expect(linhaLote).toContain('estornado');
  });
});
