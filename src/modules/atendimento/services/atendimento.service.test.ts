import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  estornarAtendimento,
  listarHistoricoAtendimentos,
  mergeAtendimentoHistoricoPreservingLegacy,
  montarExportacaoAtendimentosCsvItens,
  montarExportacaoAtendimentosPacoteZip,
  normalizarCabecalhoDocumentoAtendimentoAgrupado,
  registrarAtendimento,
  registrarAtendimentosSessao,
} from './atendimento.service';
import type { Atendimento } from '../types/atendimento.types';

const DOCUMENTOS_KEY = 'iso-pro-desktop-documentos';
const MATERIAIS_KEY = 'iso-pro-desktop-materiais';
const ATENDIMENTOS_KEY = 'iso-pro-desktop-atendimentos';
const ESTORNO_LOG_KEY = 'iso-pro-desktop-atendimento-estorno-log';

const { mockReadPayload, mockReadForWrite, mockCommitWrite, mockCommitPatch, mockGravarComando } = vi.hoisted(() => ({
  mockReadPayload: vi.fn(),
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
  mockCommitPatch: vi.fn(),
  mockGravarComando: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  /** Testes usam snapshot mockado; evita cruzar com tabela `materiais` real. */
  shouldUseCloudMaterials: vi.fn(() => false),
  getSupabase: vi.fn(() => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== 'iso_pro_read_documento_planejamento') {
        return { data: null, error: null };
      }
      const payload = (await mockReadPayload()) as {
        documentos?: Array<{ id?: string; numero?: string }>;
      };
      const docs = payload.documentos ?? [];
      const byId = String(args.p_documento_id ?? '').trim();
      const byNum = String(args.p_numero ?? '').trim().toLowerCase();
      const doc =
        docs.find((d) => byId && String(d.id ?? '') === byId) ??
        docs.find((d) => byNum && String(d.numero ?? '').trim().toLowerCase() === byNum) ??
        null;
      return { data: { documento: doc }, error: null };
    },
  })),
}));

vi.mock('../../../lib/operacaoEscalaContagens', () => ({
  fetchQuantidadeAtendidaPorCodigo: vi.fn(async () => new Map()),
  listDocumentosPendentesAtendimentoFromCloud: vi.fn(async () => []),
}));

vi.mock('../../../lib/snapshotSliceRead', () => ({
  readSnapshotRemoteSliceOrFull: (keys: readonly unknown[]) => mockReadPayload(keys),
}));

vi.mock('../../../lib/isoProSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/isoProSnapshot')>();
  return {
    ...actual,
    readIsoProSnapshotPayload: mockReadPayload,
    readIsoProSnapshotPayloadForWrite: mockReadForWrite,
    readIsoProSnapshotSlices: mockReadPayload,
    readIsoProSnapshotSlicesForWrite: vi.fn(async () => {
      const r = await mockReadForWrite();
      return { slices: r.payload ?? {}, baselineUpdatedAt: r.baselineUpdatedAt ?? null };
    }),
    commitIsoProSnapshotWrite: mockCommitWrite,
    commitIsoProSnapshotPatch: mockCommitPatch,
  };
});

vi.mock('./atendimentoComandoDesktop', () => ({
  buildDesktopAtendimentoIdempotencyKey: vi.fn(() => 'pc-test-key'),
  gravarAtendimentoNaNuvemComComando: (input: { prepare: () => Promise<unknown> }) => mockGravarComando(input),
  waitForAtendimentoSyncIdle: vi.fn(async () => undefined),
  setAtendimentoCloudBaselineCursor: vi.fn(),
  getAtendimentoCloudBaselineCursor: vi.fn(() => null),
}));

function wireSnapshotPatchMock() {
  mockCommitWrite.mockImplementation(async (prepare) => {
    await prepare();
  });
  mockCommitPatch.mockImplementation(async (prepare) => {
    return mockCommitWrite(async () => {
      const plan = await prepare();
      const base = mockReadForWrite.getMockImplementation()
        ? await mockReadForWrite()
        : { payload: await mockReadPayload(), baselineUpdatedAt: '2026-01-01T00:00:00.000Z' };
      return {
        nextPayload: { ...(base.payload ?? {}), ...plan.patch },
        baselineUpdatedAt: plan.baselineUpdatedAt ?? base.baselineUpdatedAt ?? null,
      };
    });
  });
  mockGravarComando.mockImplementation(async (input: { prepare: () => Promise<unknown> }) => {
    return mockCommitPatch(async () => {
      const prepared = (await input.prepare()) as {
        baseline: { baselineUpdatedAt: string | null };
        next: { slices: Record<string, unknown> };
      };
      return {
        patch: prepared.next.slices,
        baselineUpdatedAt: prepared.baseline.baselineUpdatedAt,
      };
    });
  });
}

vi.mock('../../colaboradores/services/colaboradores.service', () => ({
  buscarColaboradorPorId: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        id: 'colab-1',
        nome: 'Joao Interno',
        matricula: 'J1',
        funcao: 'Mecanico',
        ativo: true,
        tipo: 'interno',
        empresa: 'Empresa X',
        documento: '123',
        telefone: '11987654321',
        observacao: '',
      },
    }),
  ),
  listarColaboradoresAtivos: vi.fn(() =>
    Promise.resolve([
      {
        id: 'colab-atd',
        nome: 'Maria',
        matricula: 'M-AT',
        funcao: 'Conferente',
        tipo: 'interno' as const,
        ativo: true,
        empresa: '',
        documento: '',
        telefone: '',
        observacao: '',
      },
      {
        id: 'colab-1',
        nome: 'Joao Interno',
        matricula: 'J1',
        funcao: 'Mecanico',
        tipo: 'interno' as const,
        ativo: true,
        empresa: 'Empresa X',
        documento: '123',
        telefone: '11987654321',
        observacao: '',
      },
    ]),
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

function snapshotDoisDocumentosAtendimento() {
  return {
    documentos: [
      {
        id: 'doc-atd',
        numero: 'D1',
        revisao: 'A',
        descricao: 'Doc 1',
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
      {
        id: 'doc-atd-2',
        numero: 'D2',
        revisao: 'B',
        descricao: 'Doc 2',
        responsavel: 'Resp 2',
        status: 'pendente',
        itens: [
          {
            id: 'doc-atd-item-2',
            codigo: 'M2',
            descricao: 'Material 2',
            unidade: 'UN',
            quantidade: 5,
            quantidadeAtendida: 0,
          },
        ],
      },
    ],
    materiais: [
      { id: 'mat-1', codigo: 'M1', descricao: 'Material 1', unidade: 'UN', saldoAtual: 100 },
      { id: 'mat-2', codigo: 'M2', descricao: 'Material 2', unidade: 'UN', saldoAtual: 50 },
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

describe('atendimento.service / mergeAtendimentoHistoricoPreservingLegacy', () => {
  it('preserva linhas legado cujo lote nao esta em atendimentos', () => {
    const legacy = [
      {
        id: 1,
        loteNumero: 'ATD-20260413-00012',
        data: '2026-04-13T10:00:00.000Z',
        documentoId: 'd1',
        documento: 'Doc A',
        atendente: 'Admin',
        recebedor: 'Joao',
        codigo: 'X',
        descricao: 'Item',
        unidade: 'UN',
        quantidade: 5,
        origem: 'mobile' as const,
      },
    ];
    const atendimentos = [
      {
        id: 'a1',
        numero: 'ATD-20260529-0003',
        documentoId: 'd2',
        documentoNumero: 'Doc B',
        atendente: 'Igor',
        recebedorTipo: 'interno' as const,
        recebedorColaboradorId: null,
        recebedor: 'Gabriel',
        recebedorEmpresa: '',
        recebedorDocumento: '',
        recebedorTelefone: '',
        autorizadorInterno: '',
        motivoRetirada: '',
        origem: 'windows' as const,
        status: 'concluido' as const,
        dataAtendimento: '2026-05-29T22:44:05.000Z',
        itens: [
          {
            id: 'i1',
            documentoItemId: 'x',
            materialId: null,
            codigoMaterial: 'Y',
            descricaoMaterial: 'Novo',
            unidade: 'UN',
            quantidadeAtendida: 10,
          },
        ],
      },
    ];

    const merged = mergeAtendimentoHistoricoPreservingLegacy(legacy, atendimentos);
    const lotes = new Set(merged.map((h) => h.loteNumero));

    expect(lotes.has('ATD-20260413-00012')).toBe(true);
    expect(lotes.has('ATD-20260529-0003')).toBe(true);
    expect(merged.length).toBe(2);
  });

  it('substitui historico derivado quando o lote ja existe em atendimentos', () => {
    const legacy = [
      {
        id: 1,
        loteNumero: 'ATD-20260529-0003',
        data: '2026-05-29T20:00:00.000Z',
        documentoId: 'd1',
        documento: 'Antigo',
        atendente: 'Admin',
        recebedor: 'Joao',
        codigo: 'OLD',
        descricao: 'Velho',
        unidade: 'UN',
        quantidade: 1,
        origem: 'mobile' as const,
      },
    ];
    const atendimentos = [
      {
        id: 'a1',
        numero: 'ATD-20260529-0003',
        documentoId: 'd2',
        documentoNumero: 'Doc B',
        atendente: 'Igor',
        recebedorTipo: 'interno' as const,
        recebedorColaboradorId: null,
        recebedor: 'Gabriel',
        recebedorEmpresa: '',
        recebedorDocumento: '',
        recebedorTelefone: '',
        autorizadorInterno: '',
        motivoRetirada: '',
        origem: 'windows' as const,
        status: 'concluido' as const,
        dataAtendimento: '2026-05-29T22:44:05.000Z',
        itens: [
          {
            id: 'i1',
            documentoItemId: 'x',
            materialId: null,
            codigoMaterial: 'NEW',
            descricaoMaterial: 'Atualizado',
            unidade: 'UN',
            quantidadeAtendida: 10,
          },
        ],
      },
    ];

    const merged = mergeAtendimentoHistoricoPreservingLegacy(legacy, atendimentos);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.codigo).toBe('NEW');
    expect(merged[0]?.descricao).toBe('Atualizado');
  });
});

describe('atendimento.service / listarHistoricoAtendimentos (fusao snapshot)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireSnapshotPatchMock();
  });

  it('separa sessoes com mesmo loteNumero mas loteId distinto (colisao mobile x PC)', async () => {
    mockReadPayload.mockResolvedValue({
      documentos: [],
      materiais: [],
      atendimentos: [],
      atendimentoHistorico: [
        {
          id: 1,
          loteNumero: 'ATD-20260705-00073',
          loteId: 1001,
          data: '2026-07-05T19:12:00.000Z',
          documentoId: 'd1',
          documento: 'PL-MOB',
          atendente: 'Campo',
          recebedor: 'Joao',
          codigo: 'CE-EV',
          descricao: 'Item mobile',
          unidade: 'UN',
          quantidade: 1,
          origem: 'mobile' as const,
        },
        {
          id: 2,
          loteNumero: 'ATD-20260705-00073',
          loteId: 2002,
          data: '2026-07-05T08:58:00.000Z',
          documentoId: 'd2',
          documento: 'PL-PC',
          atendente: 'Admin',
          recebedor: 'Maria',
          codigo: 'X-PC',
          descricao: 'Item PC',
          unidade: 'UN',
          quantidade: 70,
          origem: 'windows' as const,
        },
      ],
    });

    const list = await listarHistoricoAtendimentos();
    expect(list.length).toBe(2);
    const numeros = list.map((a) => a.numero);
    expect(numeros.every((n) => n === 'ATD-20260705-00073')).toBe(true);
    const codigos = list.flatMap((a) => a.itens.map((it) => it.codigoMaterial)).sort();
    expect(codigos).toEqual(['CE-EV', 'X-PC']);
  });

  it('inclui lotes so em atendimentoHistorico quando ja existe array atendimentos (mobile + PC)', async () => {
    mockReadPayload.mockResolvedValue({
      documentos: [],
      materiais: [],
      atendimentos: [
        {
          id: 'a-pc',
          numero: 'ATD-20260503-0002',
          documentoId: 'd1',
          documentoNumero: 'Agua',
          atendente: 'Igor',
          recebedorTipo: 'interno',
          recebedor: 'Adauto',
          origem: 'windows',
          status: 'concluido',
          dataAtendimento: '2026-05-03T16:00:50.000Z',
          itens: [
            {
              id: 'i1',
              documentoItemId: 'x',
              codigoMaterial: 'TUB',
              descricaoMaterial: 'Tubo',
              unidade: 'M',
              quantidadeAtendida: 60,
            },
          ],
        },
      ],
      atendimentoHistorico: [
        {
          id: 99,
          loteNumero: 'ATD-20260503-00026',
          data: '2026-05-03T19:37:00.000Z',
          documentoId: 'd1',
          documento: 'Agua',
          atendente: 'Administrador',
          recebedor: 'Mauricio',
          codigo: 'TUB',
          descricao: 'Tubo',
          unidade: 'M',
          quantidade: 70,
          origem: 'mobile' as const,
        },
      ],
    });

    const list = await listarHistoricoAtendimentos();
    const numeros = new Set(list.map((a) => a.numero));
    expect(numeros.has('ATD-20260503-0002')).toBe(true);
    expect(numeros.has('ATD-20260503-00026')).toBe(true);
    expect(list.length).toBe(2);
  });

  it('mapeia matricula e funcoes das linhas de historico mobile para o modelo do PC', async () => {
    mockReadPayload.mockResolvedValue({
      documentos: [],
      materiais: [],
      atendimentos: [],
      atendimentoHistorico: [
        {
          id: 1,
          loteNumero: 'ATD-20260503-00099',
          data: '2026-05-03T12:00:00.000Z',
          documentoId: 'd1',
          documento: 'Doc',
          atendente: 'Administrador',
          matricula: 'adm01',
          atendenteFuncao: 'Supervisor',
          recebedor: 'Joao Silva',
          recebedorMatricula: '25924',
          recebedorFuncao: 'Mecanico',
          codigo: 'X',
          descricao: 'Y',
          unidade: 'UN',
          quantidade: 1,
          origem: 'mobile' as const,
        },
      ],
    });

    const list = await listarHistoricoAtendimentos();
    expect(list.length).toBe(1);
    const a = list[0]!;
    expect(a.atendenteMatricula).toBe('adm01');
    expect(a.atendenteFuncao).toBe('Supervisor');
    expect(a.recebedorMatricula).toBe('25924');
    expect(a.recebedorFuncao).toBe('Mecanico');
  });

  it('prefere historico mobile com documentos distintos por item quando array atendimentos agrupa tudo num desenho', async () => {
    mockReadPayload.mockResolvedValue({
      documentos: [],
      materiais: [],
      atendimentos: [
        {
          id: 'a-wrong',
          numero: 'ATD-20260610-00042',
          documentoId: 'd-bgc',
          documentoNumero: 'BGC-18"-BT-044-SS1-NI',
          atendente: 'Igor',
          recebedorTipo: 'interno',
          recebedor: 'Jonatas',
          origem: 'mobile',
          status: 'concluido',
          dataAtendimento: '2026-06-12T15:37:33.000Z',
          itens: [
            {
              id: 'i1',
              documentoItemId: 'x',
              codigoMaterial: 'PL0001',
              descricaoMaterial: 'Junta',
              unidade: 'PC',
              quantidadeAtendida: 2,
            },
            {
              id: 'i2',
              documentoItemId: 'y',
              codigoMaterial: 'ATER0006',
              descricaoMaterial: 'Rebite',
              unidade: 'PC',
              quantidadeAtendida: 1,
            },
          ],
        },
      ],
      atendimentoHistorico: [
        {
          id: 1,
          loteNumero: 'ATD-20260610-00042',
          data: '2026-06-12T15:37:33.000Z',
          documentoId: 'd-bgc',
          documento: 'BGC-18"-BT-044-SS1-NI',
          atendente: 'Igor',
          recebedor: 'Jonatas',
          codigo: 'PL0001',
          descricao: 'Junta',
          unidade: 'PC',
          quantidade: 2,
          origem: 'mobile' as const,
        },
        {
          id: 2,
          loteNumero: 'ATD-20260610-00042',
          data: '2026-06-12T15:37:33.000Z',
          documentoId: 'd-other',
          documento: 'E.RAZN010-IE6-00002-ABOVE',
          atendente: 'Igor',
          recebedor: 'Jonatas',
          codigo: 'ATER0006',
          descricao: 'Rebite',
          unidade: 'PC',
          quantidade: 1,
          origem: 'mobile' as const,
        },
      ],
    });

    const list = await listarHistoricoAtendimentos();
    expect(list.length).toBe(1);
    const a = list[0]!;
    expect(a.documentoNumero).toBe('MULTIPLOS');
    expect(a.itens.map((it) => it.documentoNumero)).toEqual([
      'BGC-18"-BT-044-SS1-NI',
      'E.RAZN010-IE6-00002-ABOVE',
    ]);
  });
});

describe('normalizarCabecalhoDocumentoAtendimentoAgrupado', () => {
  it('marca MULTIPLOS quando itens pertencem a desenhos diferentes', () => {
    const at: Atendimento = {
      id: '1',
      numero: 'ATD-X',
      documentoId: 'd1',
      documentoNumero: 'BGC-18"-BT-044-SS1-NI',
      atendente: 'A',
      recebedorTipo: 'interno',
      recebedorColaboradorId: null,
      recebedor: 'B',
      recebedorEmpresa: '',
      recebedorDocumento: '',
      recebedorTelefone: '',
      autorizadorInterno: '',
      motivoRetirada: '',
      origem: 'mobile',
      status: 'concluido',
      dataAtendimento: '2026-01-01T00:00:00.000Z',
      itens: [
        {
          id: 'i1',
          documentoItemId: '',
          materialId: null,
          codigoMaterial: 'A',
          descricaoMaterial: 'A',
          unidade: 'PC',
          quantidadeAtendida: 1,
          documentoNumero: 'BGC-18"-BT-044-SS1-NI',
        },
        {
          id: 'i2',
          documentoItemId: '',
          materialId: null,
          codigoMaterial: 'B',
          descricaoMaterial: 'B',
          unidade: 'PC',
          quantidadeAtendida: 1,
          documentoNumero: 'BGC-12"-BT-124-SS1-NI',
        },
      ],
    };
    normalizarCabecalhoDocumentoAtendimentoAgrupado(at);
    expect(at.documentoNumero).toBe('MULTIPLOS');
    expect(at.documentoId).toBe('');
  });
});

describe('atendimento.service / registrarAtendimento (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    wireSnapshotPatchMock();
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

  it('registrarAtendimentosSessao grava varios lotes em uma unica operacao', async () => {
    mockReadPayload.mockResolvedValue(snapshotDoisDocumentosAtendimento());
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

    const result = await registrarAtendimentosSessao({
      atendente: 'Maria',
      recebedorTipo: 'interno',
      recebedorColaboradorId: 'colab-1',
      recebedor: '',
      documentos: [
        { documentoId: 'doc-atd', itens: [{ documentoItemId: 'doc-atd-item-1', quantidade: 2 }] },
        { documentoId: 'doc-atd-2', itens: [{ documentoItemId: 'doc-atd-item-2', quantidade: 4 }] },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(new Set(result.data?.map((a) => a.documentoId))).toEqual(new Set(['doc-atd', 'doc-atd-2']));

    const atendimentos = JSON.parse(store[ATENDIMENTOS_KEY] ?? '[]') as Array<{ documentoId: string }>;
    expect(atendimentos).toHaveLength(2);
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
    wireSnapshotPatchMock();
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

    const result = await estornarAtendimento('atd-est-1', undefined, {
      nomeQuemEstorna: 'Admin',
      nomeQuemDevolve: 'Joao',
      motivoEstorno: 'Devolucao teste',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('estornado');

    const log = JSON.parse(store[ESTORNO_LOG_KEY] ?? '[]') as Array<{
      loteNumero: string;
      quantidadeEstornada: number;
      nomeQuemEstorna: string;
      motivoEstorno: string;
    }>;
    expect(log).toHaveLength(1);
    expect(log[0]?.loteNumero).toBe('ATD-EST-1');
    expect(log[0]?.quantidadeEstornada).toBe(5);
    expect(log[0]?.nomeQuemEstorna).toBe('Admin');
    expect(log[0]?.motivoEstorno).toBe('Devolucao teste');

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

  it('estorno total em lote MULTIPLOS reverte cada item no desenho correto', async () => {
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
          id: 'doc-a',
          numero: 'DES-A',
          revisao: '1',
          descricao: 'Desenho A',
          responsavel: 'Resp A',
          status: 'parcial',
          itens: [
            {
              id: 'doc-a-i1',
              codigo: 'M1',
              descricao: 'Material 1',
              unidade: 'UN',
              quantidade: 10,
              quantidadeAtendida: 2,
            },
          ],
        },
        {
          id: 'doc-b',
          numero: 'DES-B',
          revisao: '2',
          descricao: 'Desenho B',
          responsavel: 'Resp B',
          status: 'parcial',
          itens: [
            {
              id: 'doc-b-i1',
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
        { id: 'mat-1', codigo: 'M1', descricao: 'Material 1', unidade: 'UN', saldoAtual: 98 },
        { id: 'mat-2', codigo: 'M2', descricao: 'Material 2', unidade: 'PC', saldoAtual: 97 },
      ],
      atendimentos: [
        {
          id: 'atd-multi',
          numero: 'ATD-MULTI',
          documentoId: '',
          documentoNumero: 'MULTIPLOS',
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
              id: 'lote-m-a',
              documentoItemId: 'doc-a-i1',
              documentoNumero: 'DES-A',
              materialId: 'mat-1',
              codigoMaterial: 'M1',
              descricaoMaterial: 'Material 1',
              unidade: 'UN',
              quantidadeAtendida: 2,
            },
            {
              id: 'lote-m-b',
              documentoItemId: 'doc-b-i1',
              documentoNumero: 'DES-B',
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

    const result = await estornarAtendimento('atd-multi');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('estornado');

    const documentos = JSON.parse(store[DOCUMENTOS_KEY] ?? '[]') as Array<{
      id: string;
      status: string;
      itens: Array<{ id: string; quantidadeAtendida: number }>;
    }>;
    expect(documentos.find((d) => d.id === 'doc-a')?.itens[0]?.quantidadeAtendida).toBe(0);
    expect(documentos.find((d) => d.id === 'doc-a')?.status).toBe('pendente');
    expect(documentos.find((d) => d.id === 'doc-b')?.itens[0]?.quantidadeAtendida).toBe(0);
    expect(documentos.find((d) => d.id === 'doc-b')?.status).toBe('pendente');

    const materiais = JSON.parse(store[MATERIAIS_KEY] ?? '[]') as Array<{ codigo: string; saldoAtual?: number }>;
    expect(materiais.find((m) => m.codigo === 'M1')?.saldoAtual).toBe(100);
    expect(materiais.find((m) => m.codigo === 'M2')?.saldoAtual).toBe(100);
  });

  it('estorno parcial em lote MULTIPLOS reverte apenas o desenho do item selecionado', async () => {
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
          id: 'doc-a',
          numero: 'DES-A',
          revisao: '1',
          descricao: 'Desenho A',
          responsavel: 'Resp A',
          status: 'parcial',
          itens: [
            {
              id: 'doc-a-i1',
              codigo: 'M1',
              descricao: 'Material 1',
              unidade: 'UN',
              quantidade: 10,
              quantidadeAtendida: 2,
            },
          ],
        },
        {
          id: 'doc-b',
          numero: 'DES-B',
          revisao: '2',
          descricao: 'Desenho B',
          responsavel: 'Resp B',
          status: 'parcial',
          itens: [
            {
              id: 'doc-b-i1',
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
        { id: 'mat-1', codigo: 'M1', descricao: 'Material 1', unidade: 'UN', saldoAtual: 98 },
        { id: 'mat-2', codigo: 'M2', descricao: 'Material 2', unidade: 'PC', saldoAtual: 97 },
      ],
      atendimentos: [
        {
          id: 'atd-multi-p',
          numero: 'ATD-MULTI-P',
          documentoId: '',
          documentoNumero: 'MULTIPLOS',
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
              id: 'lote-m-a',
              documentoItemId: 'doc-a-i1',
              documentoNumero: 'DES-A',
              materialId: 'mat-1',
              codigoMaterial: 'M1',
              descricaoMaterial: 'Material 1',
              unidade: 'UN',
              quantidadeAtendida: 2,
            },
            {
              id: 'lote-m-b',
              documentoItemId: 'doc-b-i1',
              documentoNumero: 'DES-B',
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

    const result = await estornarAtendimento('atd-multi-p', [{ atendimentoItemId: 'lote-m-a', quantidade: 2 }]);

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('concluido');
    expect(result.data?.itens?.length).toBe(1);
    expect(result.data?.itens?.[0].documentoNumero).toBe('DES-B');

    const documentos = JSON.parse(store[DOCUMENTOS_KEY] ?? '[]') as Array<{
      id: string;
      itens: Array<{ id: string; quantidadeAtendida: number }>;
    }>;
    expect(documentos.find((d) => d.id === 'doc-a')?.itens[0]?.quantidadeAtendida).toBe(0);
    expect(documentos.find((d) => d.id === 'doc-b')?.itens[0]?.quantidadeAtendida).toBe(3);

    const materiais = JSON.parse(store[MATERIAIS_KEY] ?? '[]') as Array<{ codigo: string; saldoAtual?: number }>;
    expect(materiais.find((m) => m.codigo === 'M1')?.saldoAtual).toBe(100);
    expect(materiais.find((m) => m.codigo === 'M2')?.saldoAtual).toBe(97);
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
    expect(result.data?.csv).toContain('quantidade_retirada_original');
    expect(result.data?.csv).toContain('quantidade_estornada_acumulada');
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

  it('exporta documento_numero por item quando lote agrupa varios desenhos', async () => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
    mockReadPayload.mockResolvedValue({
      documentos: [
        {
          id: 'd-bgc',
          numero: 'BGC-18"-BT-044-SS1-NI',
          revisao: 'A',
          descricao: 'Desenho BGC',
          responsavel: 'Resp BGC',
          status: 'parcial',
          itens: [],
        },
        {
          id: 'd-above',
          numero: 'E.RAZN010-IE6-00002-ABOVE',
          revisao: 'C',
          descricao: 'Aterramento',
          responsavel: 'Resp Above',
          status: 'parcial',
          itens: [],
        },
      ],
      materiais: [],
      atendimentos: [],
      atendimentoHistorico: [
        {
          id: 1,
          loteNumero: 'ATD-20260610-00042',
          data: '2026-06-12T15:37:33.000Z',
          documentoId: 'd-bgc',
          documento: 'BGC-18"-BT-044-SS1-NI',
          atendente: 'Igor',
          recebedor: 'Jonatas',
          codigo: 'PL0001',
          descricao: 'Junta',
          unidade: 'PC',
          quantidade: 2,
          origem: 'mobile',
        },
        {
          id: 2,
          loteNumero: 'ATD-20260610-00042',
          data: '2026-06-12T15:37:33.000Z',
          documentoId: 'd-above',
          documento: 'E.RAZN010-IE6-00002-ABOVE',
          atendente: 'Igor',
          recebedor: 'Jonatas',
          codigo: 'ATER0006',
          descricao: 'Rebite',
          unidade: 'PC',
          quantidade: 1,
          origem: 'mobile',
        },
      ],
    });

    const result = await montarExportacaoAtendimentosCsvItens();

    expect(result.success).toBe(true);
    const linhas = result.data!.csv.split(/\r?\n/).filter((l) => l.includes('ATD-20260610-00042'));
    expect(linhas.length).toBe(2);
    expect(linhas.some((l) => l.includes('PL0001') && l.includes('BGC-18'))).toBe(true);
    expect(linhas.some((l) => l.includes('ATER0006') && l.includes('E.RAZN010-IE6-00002-ABOVE'))).toBe(true);
    expect(linhas[0]).not.toEqual(linhas[1]);
  });

  it('monta ZIP com CSV de atendimentos e log de estornos', async () => {
    store[DOCUMENTOS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);
    store[ESTORNO_LOG_KEY] = JSON.stringify([
      {
        id: 'log-1',
        dataEstorno: '2026-06-01T10:00:00.000Z',
        loteNumero: 'ATD-LOG-1',
        loteId: 'atd-log-1',
        atendimentoItemId: 'item-1',
        documentoNumero: 'DOC-1',
        codigoMaterial: 'M1',
        descricaoMaterial: 'Mat',
        unidade: 'UN',
        quantidadeEstornada: 2,
        quantidadeRetiradaOriginal: 5,
        quantidadeRestanteNoLote: 3,
        nomeQuemEstorna: 'Admin',
        nomeQuemDevolve: 'Op',
        motivoEstorno: 'Erro',
        estornoParcialLote: true,
      },
    ]);

    const result = await montarExportacaoAtendimentosPacoteZip();

    expect(result.success).toBe(true);
    expect(result.data?.fileName).toMatch(/^iso-pro-atendimentos-export-/);
    expect(result.data?.zipBlob).toBeInstanceOf(Blob);
  });
});
