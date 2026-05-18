import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { ConfiguracaoSistema } from '../../configuracoes/types/configuracao.types';
import type { RncFormData, RirFormData } from '../types/qualidade.types';
import { defaultRncEvidencias, defaultRncPlanoLinhas, defaultRncTiposOcorrencia } from '../types/qualidade.types';
import {
  excluirRir,
  normalizeRirRegistro,
  rirNaoCanceladosPorRecebimentoId,
  salvarRnc,
  salvarRir,
  sugerirCodigoRirParaRecebimento,
} from './qualidade.service';

const RIR_STORAGE_KEY = 'iso-pro-desktop-rir';
const RNC_STORAGE_KEY = 'iso-pro-desktop-rnc';

const configBase: ConfiguracaoSistema = {
  cliente: '',
  projeto: '',
  contrato: '',
  local: '',
  tema: 'padrao',
  mostrarAjudaModulos: true,
  sequenciaAtendimento: 0,
  rirModoNumeracao: 'auto',
  rirProcedimentosCadastro: [],
  rirPrefSenha: '',
  rncPrefSenha: '',
  materiaisNuvem: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  isoProLinkAuthSecret: '',
  isoProAdminUserSecret: '',
  desktopVinculoAtivo: false,
  desktopInstalacaoAutorizadaId: '',
  desktopInstalacaoAutorizadaNome: '',
  desktopUltimaValidacaoEm: '',
  desktopLicencaToken: '',
  desktopLicencaEmitidaPara: '',
  desktopLicencaExpiraEm: '',
  logoInstitucionalUrl: LOGO_INSTITUCIONAL_PADRAO_FABRICA,
  documentoRodapeNome: '',
  documentoRodapeCnpj: '',
  relatorioFinalIaHabilitado: false,
  relatorioFinalIaApiKey: '',
  relatorioFinalIaModelo: 'gpt-4o-mini',
  relatorioFinalIaBaseUrl: 'https://api.openai.com/v1',
};

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

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => configBase),
}));

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  buscarRecebimentoPorId: vi.fn(async () => ({
    success: true,
    data: {
      id: 'rec-test',
      fornecedor: 'Fornecedor Teste',
      dataRecebimento: '2026-01-15',
      notaFiscal: '999',
      romaneio: 'R1',
      conferente: 'X',
      modoRecebimento: 'direto' as const,
      status: 'conferido' as const,
      observacoes: '',
      itens: [],
    },
  })),
}));

function rirForm(overrides: Partial<RirFormData> = {}): RirFormData {
  return {
    codigo: 'RIR-2026-099',
    dataRegistro: '2026-01-10',
    recebimentoId: 'rec-test',
    uo: '',
    localObra: '',
    contratoNumero: '',
    fornecedorNome: 'Fornecedor Teste',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    procedimentoNumero: 'PE-TUB-003 REV.2',
    solCompraPackList: '',
    obsCurta: '',
    itensRir: [
      {
        id: 'it-1',
        codigoMaterial: 'X1',
        quantidade: 1,
        unidade: 'UN',
        descricaoMaterial: 'Item',
        certificado: 'N/A',
      },
    ],
    instrumentos: '',
    documentosQc: '',
    observacoesQc: 'Obs inspecao',
    laudo: 'aprovado',
    assinaturaRecebimento: { nome: '', data: '' },
    assinaturaCq: { nome: 'Ana', data: '' },
    assinaturaCliente: { nome: '', data: '' },
    origem: 'Inspecao',
    responsavel: 'Ana',
    descricao: 'Texto do RIR',
    status: 'aberto',
    acaoImediata: '',
    observacoes: '',
    ...overrides,
  };
}

function rncForm(overrides: Partial<RncFormData> = {}): RncFormData {
  return {
    codigo: 'RNC-2026-099',
    dataRegistro: '2026-01-11',
    setor: 'Qualidade',
    responsavel: 'Bruno',
    descricao: 'Texto da RNC',
    descricaoDetalhada: 'Texto da RNC',
    status: 'aberto',
    planoAcao: '',
    planoAcaoLinhas: defaultRncPlanoLinhas(),
    observacoes: '',
    recebimentoId: 'rec-test',
    recebimentoNotaFiscal: '999',
    recebimentoFornecedor: 'Fornecedor Teste',
    recebimentoRomaneio: 'R1',
    recebimentoData: '2026-01-15',
    pedidoCompra: '',
    itemRecebimentoId: '',
    materialCodigo: '',
    materialDescricao: '',
    quantidadeRejeitada: 0,
    quantidadeRecebidaRef: 0,
    localArmazenagem: '',
    localArmazenagemOutro: '',
    tiposOcorrencia: defaultRncTiposOcorrencia(),
    evidencias: defaultRncEvidencias(),
    evidenciasObservacao: '',
    acaoImediataTipo: '',
    acaoImediataObservacoes: '',
    analiseCausaRaiz: '',
    encerramentoParecer: '',
    assinaturaResponsavelRnc: { nome: '', data: '' },
    assinaturaQualidade: { nome: '', data: '' },
    assinaturaFornecedor: { nome: '', data: '' },
    itensRnc: [],
    ...overrides,
  };
}

describe('qualidade.service / salvarRir (Supabase)', () => {
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
      rirRegistros: [
        {
          id: 'rir-edit',
          codigo: 'RIR-2026-099',
          dataRegistro: '2026-01-10',
          recebimentoId: 'rec-test',
          recebimentoNotaFiscal: '999',
          recebimentoFornecedor: 'Fornecedor Teste',
          uo: '',
          localObra: '',
          contratoNumero: '',
          fornecedorNome: 'Fornecedor Teste',
          inspecaoQuantitativa: true,
          inspecaoQualitativa: true,
          inspecaoDimensional: false,
          procedimentoNumero: 'PE-TUB-003 REV.2',
          obsCurta: '',
          itensRir: [
            {
              id: 'it-1',
              codigoMaterial: 'X1',
              quantidade: 1,
              unidade: 'UN',
              descricaoMaterial: 'Item',
              certificado: 'N/A',
            },
          ],
          instrumentos: '',
          documentosQc: '',
          observacoesQc: 'x',
          laudo: 'aprovado',
          assinaturaRecebimento: { nome: '', data: '' },
          assinaturaCq: { nome: 'Ana', data: '' },
          assinaturaCliente: { nome: '', data: '' },
          origem: 'Inspecao',
          responsavel: 'Ana',
          descricao: 'Antiga',
          status: 'aberto',
          acaoImediata: '',
          observacoes: '',
        },
      ],
      rncRegistros: [],
    });
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito RIR.'));

    store[RIR_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRir(rirForm({ descricao: 'Nova descricao' }), 'rir-edit');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito RIR.');
    expect(store[RIR_STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { rirRegistros: [], rncRegistros: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[RIR_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRir(rirForm({ descricao: 'Atualizado RIR' }), 'rir-edit');

    expect(result.success).toBe(true);
    expect(result.data?.descricao).toBe('Atualizado RIR');
    const local = JSON.parse(store[RIR_STORAGE_KEY] ?? '[]') as { id: string; descricao: string }[];
    expect(local.find((r) => r.id === 'rir-edit')?.descricao).toBe('Atualizado RIR');
  });
});

describe('qualidade.service / salvarRnc (Supabase)', () => {
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
      rirRegistros: [],
      rncRegistros: [
        {
          id: 'rnc-edit',
          codigo: 'RNC-2026-099',
          dataRegistro: '2026-01-11',
          setor: 'Qualidade',
          responsavel: 'Bruno',
          descricao: 'Antiga',
          descricaoDetalhada: 'Antiga',
          status: 'aberto',
          planoAcao: '',
          observacoes: '',
          recebimentoId: 'rec-test',
        },
      ],
    });
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito RNC.'));

    store[RNC_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRnc(rncForm({ descricao: 'Nova descricao', descricaoDetalhada: 'Nova descricao' }), 'rnc-edit');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito RNC.');
    expect(store[RNC_STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { rirRegistros: [], rncRegistros: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[RNC_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRnc(rncForm({ descricao: 'Atualizado RNC', descricaoDetalhada: 'Atualizado RNC' }), 'rnc-edit');

    expect(result.success).toBe(true);
    expect(result.data?.descricao).toBe('Atualizado RNC');
    const local = JSON.parse(store[RNC_STORAGE_KEY] ?? '[]') as { id: string; descricao: string }[];
    expect(local.find((r) => r.id === 'rnc-edit')?.descricao).toBe('Atualizado RNC');
  });
});

describe('qualidade.service / salvarRir criacao (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({ rirRegistros: [], rncRegistros: [] });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao criar RIR.'));

    store[RIR_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRir(rirForm({ codigo: '', descricao: 'Novo RIR' }));

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[RIR_STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto gera codigo automatico e persiste', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { rirRegistros: [], rncRegistros: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[RIR_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRir(rirForm({ codigo: '', descricao: 'RIR novo auto' }));

    expect(result.success).toBe(true);
    expect(result.data?.codigo).toMatch(/^RIR-2026-/);
    const local = JSON.parse(store[RIR_STORAGE_KEY] ?? '[]') as { descricao: string }[];
    expect(local.some((r) => r.descricao === 'RIR novo auto')).toBe(true);
  });
});

describe('qualidade.service / sugerirCodigoRirParaRecebimento', () => {
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
    vi.mocked(hasSupabaseConfig).mockReturnValue(false);
  });

  afterEach(() => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
  });

  it('prioriza tratado sobre aberto no mesmo recebimento', async () => {
    const recId = 'rec-xyz';
    const aberto = normalizeRirRegistro({
      id: '1',
      ...rirForm({ codigo: 'RIR-ABERTO', recebimentoId: recId }),
      status: 'aberto',
      dataRegistro: '2026-01-02T10:00:00.000Z',
    });
    const tratado = normalizeRirRegistro({
      id: '2',
      ...rirForm({ codigo: 'RIR-TRATADO', recebimentoId: recId }),
      status: 'tratado',
      dataRegistro: '2026-01-01T10:00:00.000Z',
    });
    store[RIR_STORAGE_KEY] = JSON.stringify([aberto, tratado]);
    const r = await sugerirCodigoRirParaRecebimento(recId);
    expect(r.success).toBe(true);
    expect(r.data).toBe('RIR-TRATADO');
  });

  it('devolve vazio quando so ha cancelado para o recebimento', async () => {
    const recId = 'rec-only-cancel';
    const cancel = normalizeRirRegistro({
      id: 'c1',
      ...rirForm({ codigo: 'RIR-X', recebimentoId: recId }),
      status: 'cancelado',
      dataRegistro: '2026-01-01T10:00:00.000Z',
    });
    store[RIR_STORAGE_KEY] = JSON.stringify([cancel]);
    const r = await sugerirCodigoRirParaRecebimento(recId);
    expect(r.success).toBe(true);
    expect(r.data).toBe('');
  });
});

describe('rirNaoCanceladosPorRecebimentoId', () => {
  it('ignora cancelados e agrupa por recebimentoId', () => {
    const recId = 'rec-agrupar';
    const rows = [
      normalizeRirRegistro({
        id: 'a',
        ...rirForm({ codigo: 'RIR-ATIVO', recebimentoId: recId }),
        status: 'aberto',
      }),
      normalizeRirRegistro({
        id: 'b',
        ...rirForm({ codigo: 'RIR-CANC', recebimentoId: recId }),
        status: 'cancelado',
      }),
    ];
    const map = rirNaoCanceladosPorRecebimentoId(rows);
    expect(map.get(recId)?.length).toBe(1);
    expect(map.get(recId)?.[0].codigo).toBe('RIR-ATIVO');
  });
});

describe('qualidade.service / excluirRir (local)', () => {
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
    vi.mocked(hasSupabaseConfig).mockReturnValue(false);
  });

  afterEach(() => {
    vi.mocked(hasSupabaseConfig).mockReturnValue(true);
  });

  it('remove registro por id', async () => {
    const a = normalizeRirRegistro({
      id: 'id-a',
      ...rirForm({ codigo: 'RIR-A' }),
      status: 'aberto',
    });
    const b = normalizeRirRegistro({
      id: 'id-b',
      ...rirForm({ codigo: 'RIR-B' }),
      status: 'aberto',
    });
    store[RIR_STORAGE_KEY] = JSON.stringify([a, b]);

    const result = await excluirRir('id-a');

    expect(result.success).toBe(true);
    const left = JSON.parse(store[RIR_STORAGE_KEY] ?? '[]') as { id: string }[];
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe('id-b');
  });

  it('nao exclui RIR tratado', async () => {
    const a = normalizeRirRegistro({
      id: 'id-t',
      ...rirForm(),
      status: 'tratado',
    });
    store[RIR_STORAGE_KEY] = JSON.stringify([a]);

    const result = await excluirRir('id-t');

    expect(result.success).toBe(false);
    expect(JSON.parse(store[RIR_STORAGE_KEY] ?? '[]')).toHaveLength(1);
  });
});

describe('qualidade.service / salvarRnc criacao (Supabase)', () => {
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
    mockReadPayload.mockResolvedValue({ rirRegistros: [], rncRegistros: [] });
  });

  it('em conflito de snapshot nao persiste localmente', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito ao criar RNC.'));

    store[RNC_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRnc(
      rncForm({ codigo: 'RNC-NOVA-001', descricao: 'Nova RNC', descricaoDetalhada: 'Nova RNC' }),
    );

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(store[RNC_STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste novo registro', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { rirRegistros: [], rncRegistros: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[RNC_STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarRnc(
      rncForm({ codigo: 'RNC-NOVA-002', descricao: 'RNC criada', descricaoDetalhada: 'RNC criada' }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.codigo).toBe('RNC-NOVA-002');
    const local = JSON.parse(store[RNC_STORAGE_KEY] ?? '[]') as { codigo: string }[];
    expect(local.some((r) => r.codigo === 'RNC-NOVA-002')).toBe(true);
  });
});
