/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importarDocumentosDoArquivoJson } from './documentos.service';

const STORAGE_KEY = 'iso-pro-desktop-documentos';
const MATERIAIS_KEY = 'iso-pro-desktop-materiais';

const { mockReadForWrite, mockCommitWrite, mockListarMateriais } = vi.hoisted(() => ({
  mockReadForWrite: vi.fn(),
  mockCommitWrite: vi.fn(),
  mockListarMateriais: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  shouldUseCloudMaterials: vi.fn(() => false),
}));

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  carregarRecebimentosCompletos: vi.fn(async () => []),
}));

vi.mock('../../materiais/services/materiais.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../materiais/services/materiais.service')>();
  return {
    ...actual,
    listarMateriais: mockListarMateriais,
    validarCodigosMateriaisAtivosNoCadastroParaRecebimento: vi.fn(async () => null),
  };
});

vi.mock('../../../lib/isoProSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/isoProSnapshot')>();
  return {
    ...actual,
    readIsoProSnapshotPayload: vi.fn(async () => ({ documentos: [] })),
    readIsoProSnapshotPayloadForWrite: mockReadForWrite,
    commitIsoProSnapshotWrite: mockCommitWrite,
  };
});

function mkMaterial(codigo: string) {
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

describe('importarDocumentosDoArquivoJson / integridade atendimento (nuvem)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListarMateriais.mockResolvedValue({
      success: true,
      data: { items: [mkMaterial('MAT-1')], total: 1, page: 1, pageSize: 999999 },
    });
    mockReadForWrite.mockResolvedValue({
      payload: {
        documentos: [],
        atendimentoHistorico: [{ documentoId: 'orphan-id', documento: 'DESENHO-ANTIGO' }],
      },
      baselineUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockCommitWrite.mockImplementation(async (build) => {
      const result = await build();
      return result;
    });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === MATERIAIS_KEY) return JSON.stringify([mkMaterial('MAT-1')]);
        if (key === STORAGE_KEY) return JSON.stringify([]);
        return null;
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: () => null,
      length: 0,
    } as Storage);
  });

  it('bloqueia gravacao na nuvem quando historico referencia desenho inexistente', async () => {
    const json = JSON.stringify({
      documentos: [
        {
          numero: 'NOVO-001',
          revisao: 'A',
          descricao: 'Teste',
          responsavel: 'R',
          dataDocumento: '2026-05-01',
          itens: [
            {
              codigoMaterial: 'MAT-1',
              descricaoMaterial: 'M',
              unidade: 'UN',
              quantidadeProjeto: 1,
              quantidadeAtendida: 0,
            },
          ],
        },
      ],
    });

    const result = await importarDocumentosDoArquivoJson(json);

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/Gravacao bloqueada|nao batem com o planejamento/i);
    expect(mockCommitWrite).toHaveBeenCalled();
  });
});
