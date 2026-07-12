/**
 * Simulacoes rigorosas do fluxo multi-doc: historico, export, busca, estorno parcial,
 * bloqueio de exclusao de documento e cenarios de auditoria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { filtrarAtendimentosPorBusca } from '../utils/filtrarHistoricoAtendimentoBusca';
import { atendimentoTemVariosDocumentos } from '../utils/estornoDocumento.utils';
import { montarHtmlReciboEstorno } from '../utils/imprimirReciboEstorno';
import type { Atendimento, AtendimentoItem } from '../types/atendimento.types';
import {
  estornarAtendimento,
  listarDocumentosComAtendimentoVinculado,
  listarHistoricoAtendimentos,
  montarExportacaoAtendimentosCsvItens,
  normalizarCabecalhoDocumentoAtendimentoAgrupado,
} from './atendimento.service';

const DOCUMENTOS_KEY = 'iso-pro-desktop-documentos';
const MATERIAIS_KEY = 'iso-pro-desktop-materiais';
const ATENDIMENTOS_KEY = 'iso-pro-desktop-atendimentos';

const { mockReadPayload, mockReadForWrite, mockCommitWrite, mockCommitPatch, mockGravarComando } = vi.hoisted(() => ({
  mockReadPayload: vi.fn(),
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
  mockCommitPatch: vi.fn(),
  mockGravarComando: vi.fn(),
}));

vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>();
  return {
    ...actual,
    hasSupabaseConfig: vi.fn(() => true),
    shouldUseCloudMaterials: vi.fn(() => false),
  };
});

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => ({
    documentoRodapeNome: 'I.S.O PRO',
    documentoRodapeCnpj: '66.234.531/0001-57',
  })),
  consumirSequenciaAtendimento: vi.fn(),
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
  buscarColaboradorPorId: vi.fn(),
  listarColaboradoresAtivos: vi.fn(() => Promise.resolve([])),
  registrarRetiranteExterno: vi.fn(),
}));

function item(
  id: string,
  cod: string,
  docNum: string,
  qtd: number,
  docItemId = `di-${id}`,
): AtendimentoItem {
  return {
    id,
    documentoItemId: docItemId,
    documentoNumero: docNum,
    materialId: null,
    codigoMaterial: cod,
    descricaoMaterial: `Mat ${cod}`,
    unidade: 'PC',
    quantidadeAtendida: qtd,
  };
}

function loteMulti4(): Atendimento {
  return {
    id: 'atd-4doc',
    numero: 'ATD-SIM-4DOC',
    documentoId: '',
    documentoNumero: 'MULTIPLOS',
    atendente: 'Operador',
    recebedorTipo: 'interno',
    recebedorColaboradorId: 'c1',
    recebedor: 'Recebedor',
    recebedorEmpresa: '',
    recebedorDocumento: '',
    recebedorTelefone: '',
    autorizadorInterno: '',
    motivoRetirada: '',
    origem: 'mobile',
    status: 'concluido',
    dataAtendimento: '2026-06-10T12:00:00.000Z',
    itens: [
      item('i-a', 'M-A', 'DES-A', 2, 'doc-a-i1'),
      item('i-b', 'M-B', 'DES-B', 1, 'doc-b-i1'),
      item('i-c', 'M-C', 'DES-C', 3, 'doc-c-i1'),
      item('i-d', 'M-D', 'DES-D', 1, 'doc-d-i1'),
    ],
  };
}

function snapshot4Desenhos() {
  const mkDoc = (id: string, num: string, cod: string, qtdAtendida: number) => ({
    id,
    numero: num,
    revisao: '1',
    descricao: `Obra ${num}`,
    responsavel: `Resp ${num}`,
    status: 'parcial',
    itens: [
      {
        id: `doc-${id}-i1`,
        codigo: cod,
        descricao: `Mat ${cod}`,
        unidade: 'PC',
        quantidade: 10,
        quantidadeAtendida: qtdAtendida,
      },
    ],
  });

  return {
    documentos: [
      mkDoc('a', 'DES-A', 'M-A', 2),
      mkDoc('b', 'DES-B', 'M-B', 1),
      mkDoc('c', 'DES-C', 'M-C', 3),
      mkDoc('d', 'DES-D', 'M-D', 1),
    ],
    materiais: [
      { id: 'ma', codigo: 'M-A', descricao: 'Mat M-A', unidade: 'PC', saldoAtual: 98 },
      { id: 'mb', codigo: 'M-B', descricao: 'Mat M-B', unidade: 'PC', saldoAtual: 99 },
      { id: 'mc', codigo: 'M-C', descricao: 'Mat M-C', unidade: 'PC', saldoAtual: 97 },
      { id: 'md', codigo: 'M-D', descricao: 'Mat M-D', unidade: 'PC', saldoAtual: 99 },
    ],
    atendimentos: [loteMulti4()],
    atendimentoHistorico: [],
  };
}

describe('Simulacao rigorosa / lote MULTIPLOS com 4 desenhos', () => {
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
    mockReadPayload.mockResolvedValue(snapshot4Desenhos());
    mockReadForWrite.mockResolvedValue({ payload: {}, baselineUpdatedAt: '2026-01-01T00:00:00.000Z' });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });
    store[DOCUMENTOS_KEY] = JSON.stringify([]);
    store[MATERIAIS_KEY] = JSON.stringify([]);
    store[ATENDIMENTOS_KEY] = JSON.stringify([]);
  });

  afterEach(() => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
  });

  it('detecta 4 desenhos distintos no lote simulado', () => {
    const at = loteMulti4();
    expect(atendimentoTemVariosDocumentos(at)).toBe(true);
    expect(at.itens.map((i) => i.documentoNumero)).toEqual(['DES-A', 'DES-B', 'DES-C', 'DES-D']);
  });

  it('estorno parcial de 1 desenho (DES-B) mantem os outros 3 no lote', async () => {
    const result = await estornarAtendimento('atd-4doc', [{ atendimentoItemId: 'i-b', quantidade: 1 }]);

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('concluido');
    expect(result.data?.itens?.length).toBe(3);
    expect(result.data?.itens?.map((i) => i.documentoNumero).sort()).toEqual(['DES-A', 'DES-C', 'DES-D']);

    const documentos = JSON.parse(store[DOCUMENTOS_KEY] ?? '[]') as Array<{
      id: string;
      itens: Array<{ quantidadeAtendida: number }>;
    }>;
    expect(documentos.find((d) => d.id === 'b')?.itens[0]?.quantidadeAtendida).toBe(0);
    expect(documentos.find((d) => d.id === 'a')?.itens[0]?.quantidadeAtendida).toBe(2);
    expect(documentos.find((d) => d.id === 'c')?.itens[0]?.quantidadeAtendida).toBe(3);

    const materiais = JSON.parse(store[MATERIAIS_KEY] ?? '[]') as Array<{ codigo: string; saldoAtual?: number }>;
    expect(materiais.find((m) => m.codigo === 'M-B')?.saldoAtual).toBe(100);
    expect(materiais.find((m) => m.codigo === 'M-A')?.saldoAtual).toBe(98);
  });

  it('estorno de 2 desenhos (DES-A + DES-D) deixa 2 itens e saldos corretos', async () => {
    const result = await estornarAtendimento('atd-4doc', [
      { atendimentoItemId: 'i-a', quantidade: 2 },
      { atendimentoItemId: 'i-d', quantidade: 1 },
    ]);

    expect(result.success).toBe(true);
    expect(result.data?.itens?.length).toBe(2);
    expect(result.data?.itens?.map((i) => i.documentoNumero).sort()).toEqual(['DES-B', 'DES-C']);

    const materiais = JSON.parse(store[MATERIAIS_KEY] ?? '[]') as Array<{ codigo: string; saldoAtual?: number }>;
    expect(materiais.find((m) => m.codigo === 'M-A')?.saldoAtual).toBe(100);
    expect(materiais.find((m) => m.codigo === 'M-D')?.saldoAtual).toBe(100);
    expect(materiais.find((m) => m.codigo === 'M-B')?.saldoAtual).toBe(99);
  });

  it('export CSV apos historico multi-doc lista documento_numero por item', async () => {
    mockReadPayload.mockResolvedValue({
      ...snapshot4Desenhos(),
      atendimentos: [],
      atendimentoHistorico: loteMulti4().itens.map((it, idx) => ({
        id: idx + 1,
        loteNumero: 'ATD-SIM-4DOC',
        data: '2026-06-10T12:00:00.000Z',
        documentoId: '',
        documento: it.documentoNumero,
        atendente: 'Operador',
        recebedor: 'Recebedor',
        codigo: it.codigoMaterial,
        descricao: it.descricaoMaterial,
        unidade: it.unidade,
        quantidade: it.quantidadeAtendida,
        origem: 'mobile',
      })),
    });

    const result = await montarExportacaoAtendimentosCsvItens();
    expect(result.success).toBe(true);

    const linhas = result.data!.csv.split(/\r?\n/).filter((l) => l.includes('ATD-SIM-4DOC'));
    expect(linhas.length).toBe(4);
    for (const doc of ['DES-A', 'DES-B', 'DES-C', 'DES-D']) {
      expect(linhas.some((l) => l.includes(doc))).toBe(true);
    }
    expect(linhas.every((l) => l.includes('Mobile'))).toBe(true);
  });

  it('busca historico encontra lote por qualquer um dos 4 desenhos', async () => {
    mockReadPayload.mockResolvedValue(snapshot4Desenhos());
    const lista = await listarHistoricoAtendimentos();
    expect(lista.length).toBe(1);

    for (const doc of ['DES-A', 'DES-B', 'DES-C', 'DES-D']) {
      expect(filtrarAtendimentosPorBusca(lista, doc)).toHaveLength(1);
    }
    expect(filtrarAtendimentosPorBusca(lista, 'M-C parafuso')).toHaveLength(0);
    expect(filtrarAtendimentosPorBusca(lista, 'ATD-SIM M-C')).toHaveLength(1);
  });

  it('listarDocumentosComAtendimentoVinculado detecta vinculo por documentoNumero do item', async () => {
    mockReadPayload.mockResolvedValue(snapshot4Desenhos());
    const bloqueados = await listarDocumentosComAtendimentoVinculado([
      { id: 'a', numero: 'DES-A', revisao: '1' },
      { id: 'b', numero: 'DES-B', revisao: '1' },
      { id: 'x', numero: 'SEM-VINCULO', revisao: '1' },
    ]);

    const ids = bloqueados.map((b) => b.documentoId).sort();
    expect(ids).toEqual(['a', 'b']);
    expect(bloqueados.find((b) => b.documentoId === 'a')?.exemplosLotes).toContain('ATD-SIM-4DOC');
  });

  it('listarDocumentosComAtendimentoVinculado ignora cabecalho MULTIPLOS sem documentoId', async () => {
    mockReadPayload.mockResolvedValue(snapshot4Desenhos());
    const bloqueados = await listarDocumentosComAtendimentoVinculado([
      { id: 'c', numero: 'des-c', revisao: '1' },
    ]);
    expect(bloqueados).toHaveLength(1);
    expect(bloqueados[0]?.documentoId).toBe('c');
  });

  it('recibo estorno parcial de 1 desenho lista so itens devolvidos com coluna Documento', () => {
    const at = loteMulti4();
    const html = montarHtmlReciboEstorno({
      atendimento: at,
      documentoNumero: 'MULTIPLOS',
      documentoTitulo: 'Varios desenhos (ver coluna Documento)',
      documentoRevisao: '—',
      documentoDescricao: 'DES-B: Obra B',
      documentoResponsavel: '—',
      nomeQuemEstorna: 'Admin',
      nomeQuemDevolve: 'Joao',
      motivoEstorno: 'Devolucao desenho B',
      estornoParcial: true,
      itensEstorno: [at.itens[1]!],
    });

    expect(html).toContain('Estorno parcial');
    expect(html).toContain('DES-B');
    expect(html).not.toContain('>DES-A<');
    expect(html).not.toContain('>DES-C<');
  });

  it('rejeita estorno com quantidade maior que a registrada no item', async () => {
    const result = await estornarAtendimento('atd-4doc', [{ atendimentoItemId: 'i-c', quantidade: 99 }]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maior que a registrada/i);
  });

  it('normalizarCabecalho corrige lote com um unico desenho nos itens', () => {
    const at: Atendimento = {
      ...loteMulti4(),
      documentoNumero: 'MULTIPLOS',
      documentoId: '',
      itens: [item('only', 'M-X', 'DES-UNICO', 1)],
    };
    normalizarCabecalhoDocumentoAtendimentoAgrupado(at);
    expect(at.documentoNumero).toBe('DES-UNICO');
  });
});

describe('Simulacao rigorosa / cenarios de auditoria export vs planejamento', () => {
  it('CSV correto nao gera conflito documento x material (simulacao ATD-00042)', async () => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
    mockReadPayload.mockResolvedValue({
      documentos: [
        { id: 'd1', numero: 'BGC-18"-BT-044-SS1-NI', revisao: 'A', descricao: 'BGC', responsavel: 'R', status: 'parcial', itens: [] },
        { id: 'd2', numero: 'E.RAZN010-IE6-00002-ABOVE', revisao: 'C', descricao: 'Above', responsavel: 'R', status: 'parcial', itens: [] },
      ],
      materiais: [],
      atendimentos: [],
      atendimentoHistorico: [
        { id: 1, loteNumero: 'ATD-20260610-00042', data: '2026-06-10T00:00:00.000Z', documento: 'BGC-18"-BT-044-SS1-NI', atendente: 'I', recebedor: 'J', codigo: 'PL0001', descricao: 'Junta', unidade: 'PC', quantidade: 2, origem: 'mobile' },
        { id: 2, loteNumero: 'ATD-20260610-00042', data: '2026-06-10T00:00:00.000Z', documento: 'E.RAZN010-IE6-00002-ABOVE', atendente: 'I', recebedor: 'J', codigo: 'ATER0006', descricao: 'Rebite', unidade: 'PC', quantidade: 1, origem: 'mobile' },
      ],
    });

    const result = await montarExportacaoAtendimentosCsvItens();
    expect(result.success).toBe(true);

    const linhas = result.data!.csv.split(/\r?\n/).filter((l) => l.includes('ATD-20260610-00042'));
    expect(linhas.length).toBe(2);
    expect(linhas.some((l) => l.includes('PL0001') && l.includes('BGC-18'))).toBe(true);
    expect(linhas.some((l) => l.includes('ATER0006') && l.includes('E.RAZN010-IE6-00002-ABOVE'))).toBe(true);
    const docsDistintos = new Set(
      linhas.map((l) => {
        const m = l.match(/;([^;]*BGC[^;]*|[^;]*E\.RAZN[^;]*);/);
        return m?.[1]?.replace(/^"|"$/g, '') ?? l;
      }),
    );
    expect(linhas[0]).not.toEqual(linhas[1]);
    expect(docsDistintos.size).toBeGreaterThanOrEqual(2);
  });
});
