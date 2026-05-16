import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IsoProSnapshotConflictError } from '../../../lib/isoProSnapshot';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import type { DocumentoFormData } from '../types/documento.types';
import { cancelarDocumento, excluirDocumentoDefinitivamente, excluirDocumentosDefinitivamente, salvarDocumento } from './documentos.service';

const STORAGE_KEY = 'iso-pro-desktop-documentos';
const MATERIAIS_KEY = 'iso-pro-desktop-materiais';

const { mockReadPayload, mockReadForWrite, mockCommitWrite, mockListarMateriais } = vi.hoisted(() => ({
  mockReadPayload: vi.fn(),
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
  mockListarMateriais: vi.fn(),
}));

vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>();
  return {
    ...actual,
    hasSupabaseConfig: vi.fn(() => true),
    shouldUseCloudMaterials: vi.fn(() => false),
  };
});

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  carregarRecebimentosCompletos: vi.fn(async () => []),
}));

vi.mock('../../materiais/services/materiais.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../materiais/services/materiais.service')>();
  return {
    ...actual,
    listarMateriais: mockListarMateriais,
  };
});

vi.mock('../../../lib/isoProSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/isoProSnapshot')>();
  return {
    ...actual,
    readIsoProSnapshotPayload: mockReadPayload,
    readIsoProSnapshotPayloadForWrite: mockReadForWrite,
    commitIsoProSnapshotWrite: mockCommitWrite,
  };
});

function minimalForm(overrides: Partial<DocumentoFormData> = {}): DocumentoFormData {
  return {
    numero: 'N1',
    revisao: 'A',
    descricao: 'Descricao',
    responsavel: 'Resp',
    dataDocumento: '2026-01-10',
    observacao: '',
    itens: [
      {
        id: 'item-1',
        codigoMaterial: 'C1',
        descricaoMaterial: 'Material',
        unidade: 'UN',
        quantidadeProjeto: 10,
        quantidadeAtendida: 0,
      },
    ],
    ...overrides,
  };
}

function mkMaterialListItem(codigo: string) {
  return {
    id: `id-${codigo}`,
    codigo,
    codigoBarras: '',
    descricao: 'D',
    disciplina: 'G',
    unidade: 'UN',
    peso: 1,
    estoqueMinimo: 0,
    saldoAtual: 0,
    ativo: true,
  };
}

/** Codigos usados nos payloads de teste (documentos + limpeza por cadastro de materiais). */
function resetMateriaisMockParaDocumentos() {
  mockListarMateriais.mockResolvedValue({
    success: true,
    data: {
      items: ['C1', 'X1', 'Y1', 'TB-0001', 'EL-0102', 'MT-0020'].map(mkMaterialListItem),
      total: 7,
      page: 1,
      pageSize: 999999,
    },
  });
}

function seedMateriaisLocalStorageParaValidacao(store: Record<string, string>) {
  store[MATERIAIS_KEY] = JSON.stringify(['C1', 'X1', 'Y1', 'TB-0001', 'EL-0102', 'MT-0020'].map(mkMaterialListItem));
}

describe('documentos.service / salvarDocumento (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMateriaisMockParaDocumentos();
    store = {};
    const ls = {
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
    } as Storage;
    vi.stubGlobal('localStorage', ls);
    mockReadPayload.mockResolvedValue({
      documentos: [
        {
          id: 'doc-edit',
          numero: 'N1',
          revisao: 'A',
          data: '2026-01-10',
          descricao: 'Antigo',
          responsavel: 'Resp',
          itens: [
            {
              id: 'item-1',
              codigo: 'C1',
              descricao: 'Material',
              unidade: 'UN',
              quantidade: 10,
              quantidadeAtendida: 0,
            },
          ],
        },
      ],
    });
    seedMateriaisLocalStorageParaValidacao(store);
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Dados alterados por outro usuario.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarDocumento(minimalForm({ descricao: 'Novo texto' }), 'doc-edit');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Dados alterados por outro usuario.');
    expect(result.meta?.snapshotConflict).toBe(true);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
    expect(mockCommitWrite).toHaveBeenCalledTimes(1);
  });

  it('recusa salvar quando o codigo do material nao existe no cadastro de materiais', async () => {
    store[MATERIAIS_KEY] = JSON.stringify([mkMaterialListItem('TB-0001')]);
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });
    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarDocumento(
      minimalForm({
        itens: [
          {
            id: 'item-1',
            codigoMaterial: 'BV-SUB-TRA501',
            descricaoMaterial: 'Teste',
            unidade: 'UN',
            quantidadeProjeto: 1,
            quantidadeAtendida: 0,
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/BV-SUB-TRA501/);
    expect(result.error).toMatch(/nao cadastrado/i);
    expect(mockCommitWrite).not.toHaveBeenCalled();
  });

  it('em sucesso remoto persiste copia local', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await salvarDocumento(minimalForm({ descricao: 'Atualizado' }), 'doc-edit');

    expect(result.success).toBe(true);
    expect(result.data?.descricao).toBe('Atualizado');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; descricao: string }[];
    expect(local.some((d) => d.id === 'doc-edit' && d.descricao === 'Atualizado')).toBe(true);
  });

  it('recusa salvar na nuvem quando o armazenamento local tem mais documentos que a lista carregada do snapshot', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([{ id: 'ghost-1' }, { id: 'ghost-2' }, { id: 'ghost-3' }]);

    const result = await salvarDocumento(minimalForm({ descricao: 'Tentativa' }), 'doc-edit');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/armazenamento deste navegador/i);
    expect(result.error).toMatch(/Enviar planejamento deste PC para a nuvem/i);
    expect(mockCommitWrite).not.toHaveBeenCalled();
  });
});

function payloadDocCancelarPendente() {
  return {
    documentos: [
      {
        id: 'doc-cancel',
        numero: 'NC',
        revisao: 'A',
        data: '2026-02-01',
        descricao: 'Doc para cancelar',
        responsavel: 'R',
        itens: [
          {
            id: 'dc-item-1',
            codigo: 'X1',
            descricao: 'Item',
            unidade: 'UN',
            quantidade: 3,
            quantidadeAtendida: 0,
          },
        ],
      },
    ],
  };
}

/** Documento com todas as linhas atendidas agrega status `atendido` (regra da lista). */
function payloadDocCancelarAtendido() {
  return {
    documentos: [
      {
        id: 'doc-cancel-atendido',
        numero: 'NA',
        revisao: 'B',
        data: '2026-02-02',
        descricao: 'Doc atendido para cancelar adm',
        responsavel: 'R',
        itens: [
          {
            id: 'dca-item-1',
            codigo: 'X1',
            descricao: 'Item',
            unidade: 'UN',
            quantidade: 3,
            quantidadeAtendida: 3,
          },
        ],
      },
    ],
  };
}

describe('documentos.service / cancelarDocumento (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMateriaisMockParaDocumentos();
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
    mockReadPayload.mockResolvedValue(payloadDocCancelarPendente());
    seedMateriaisLocalStorageParaValidacao(store);
  });

  it('em conflito de snapshot nao persiste localmente e expoe meta.snapshotConflict', async () => {
    mockCommitWrite.mockRejectedValue(new IsoProSnapshotConflictError('Conflito no cancelamento.'));

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await cancelarDocumento('doc-cancel');

    expect(result.success).toBe(false);
    expect(isSnapshotConflictResult(result)).toBe(true);
    expect(result.error).toBe('Conflito no cancelamento.');
    expect(store[STORAGE_KEY]).toBe(JSON.stringify([]));
  });

  it('em sucesso remoto persiste copia local com status cancelado', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await cancelarDocumento('doc-cancel');

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('cancelado');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; status: string }[];
    expect(local.find((d) => d.id === 'doc-cancel')?.status).toBe('cancelado');
  });

  it('recusa cancelar na nuvem quando armazenamento local tem mais documentos que o snapshot', async () => {
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([{ id: 'ghost-1' }, { id: 'ghost-2' }, { id: 'ghost-3' }]);

    const result = await cancelarDocumento('doc-cancel');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/armazenamento deste navegador/i);
    expect(mockCommitWrite).not.toHaveBeenCalled();
  });

  it('documento nao pendente exige justificativa administrativa', async () => {
    mockReadPayload.mockResolvedValue(payloadDocCancelarAtendido());

    const semMotivo = await cancelarDocumento('doc-cancel-atendido');
    expect(semMotivo.success).toBe(false);
    expect(semMotivo.error).toContain('15');

    const motivoCurto = await cancelarDocumento('doc-cancel-atendido', { motivoAdministrativo: 'curto' });
    expect(motivoCurto.success).toBe(false);
    expect(motivoCurto.error).toContain('15');
  });

  it('documento nao pendente cancela com justificativa longa o suficiente', async () => {
    mockReadPayload.mockResolvedValue(payloadDocCancelarAtendido());
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await cancelarDocumento('doc-cancel-atendido', {
      motivoAdministrativo: 'Substituicao formal do escopo; revisao C passa a valer.',
      actorLogin: 'admin.test',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('cancelado');
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string; status: string }[];
    expect(local.find((d) => d.id === 'doc-cancel-atendido')?.status).toBe('cancelado');
  });
});

describe('documentos.service / excluirDocumentoDefinitivamente (Supabase)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMateriaisMockParaDocumentos();
    store = {};
    const ls = {
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
    } as Storage;
    vi.stubGlobal('localStorage', ls);
    mockReadPayload.mockResolvedValue({
      documentos: [
        ...payloadDocCancelarPendente().documentos,
        {
          id: 'doc-outro',
          numero: 'NO',
          revisao: 'A',
          data: '2026-02-01',
          descricao: 'Outro',
          responsavel: 'R',
          itens: [
            {
              id: 'o-item-1',
              codigo: 'Y1',
              descricao: 'Item',
              unidade: 'UN',
              quantidade: 1,
              quantidadeAtendida: 0,
            },
          ],
        },
      ],
    });
    mockReadForWrite.mockResolvedValue({
      payload: { documentos: [] },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (fn: () => Promise<unknown>) => {
      await fn();
    });
    seedMateriaisLocalStorageParaValidacao(store);
  });

  it('remove o documento do snapshot e mantem os demais no armazenamento local', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await excluirDocumentoDefinitivamente('doc-cancel');

    expect(result.success).toBe(true);
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string }[];
    expect(local.find((d) => d.id === 'doc-cancel')).toBeUndefined();
    expect(local.find((d) => d.id === 'doc-outro')).toBeDefined();
  });

  it('excluirDocumentosDefinitivamente remove varios documentos de uma vez', async () => {
    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await excluirDocumentosDefinitivamente(['doc-cancel', 'doc-outro']);

    expect(result.success).toBe(true);
    expect(result.data?.removidos).toBe(2);
    const local = JSON.parse(store[STORAGE_KEY] ?? '[]') as { id: string }[];
    expect(local.length).toBe(0);
  });

  it('recusa exclusao definitiva quando existe atendimento vinculado ao documento', async () => {
    mockReadPayload.mockResolvedValue({
      documentos: [
        ...payloadDocCancelarPendente().documentos,
        {
          id: 'doc-outro',
          numero: 'NO',
          revisao: 'A',
          data: '2026-02-01',
          descricao: 'Outro',
          responsavel: 'R',
          itens: [
            {
              id: 'o-item-1',
              codigo: 'Y1',
              descricao: 'Item',
              unidade: 'UN',
              quantidade: 1,
              quantidadeAtendida: 0,
            },
          ],
        },
      ],
      atendimentos: [
        {
          id: 'at-1',
          numero: 'ATD-20260406-00001',
          documentoId: 'doc-cancel',
          documentoNumero: 'NC',
          atendente: 'Administrador',
          recebedorTipo: 'interno',
          recebedorColaboradorId: null,
          recebedor: 'Breno',
          recebedorEmpresa: '',
          recebedorDocumento: '',
          recebedorTelefone: '',
          autorizadorInterno: '',
          motivoRetirada: '',
          origem: 'windows',
          status: 'concluido',
          dataAtendimento: '2026-04-06T19:34:53.000Z',
          itens: [
            {
              id: 'at-i1',
              documentoItemId: 'dc-item-1',
              materialId: null,
              codigoMaterial: 'X1',
              descricaoMaterial: 'Item',
              unidade: 'UN',
              quantidadeAtendida: 1,
            },
          ],
        },
      ],
    });

    store[STORAGE_KEY] = JSON.stringify([]);

    const result = await excluirDocumentoDefinitivamente('doc-cancel');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/atendimento/i);
    expect(result.error).toMatch(/NC Rev\. A/);
  });
});
