import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListAllCompletos = vi.fn();

vi.mock('../../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/supabase')>();
  return {
    ...actual,
    hasSupabaseConfig: vi.fn(() => true),
    shouldUseCloudMaterials: vi.fn(() => false),
    getSupabase: vi.fn(() => null),
  };
});

vi.mock('../../../lib/documentosPlanejamentoTabelas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/documentosPlanejamentoTabelas')>();
  return {
    ...actual,
    listAllDocumentosPlanejamentoCompletosFromCloud: (...args: unknown[]) => mockListAllCompletos(...args),
  };
});

vi.mock('../../../lib/snapshotSliceRead', () => ({
  readSnapshotRemoteSliceOrFull: vi.fn(async () => ({
    documentos: [
      {
        id: 'snap-old',
        numero: 'DOC-STALE',
        revisao: 'A',
        itens: [{ id: 'i0', codigo: 'OLD', quantidade: 1, quantidadeAtendida: 0 }],
      },
    ],
    atendimentos: [],
    atendimentoHistorico: [],
  })),
}));

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  carregarRecebimentosCompletos: vi.fn(async () => []),
}));

vi.mock('../../materiais/services/materiais.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../materiais/services/materiais.service')>();
  return {
    ...actual,
    listarMateriais: vi.fn(async () => ({ success: true, data: { items: [], total: 0 } })),
    carregarMateriaisDoCadastro: vi.fn(async () => []),
  };
});

describe('carregarTodosDocumentosOrdenados — exportacao SoT', () => {
  beforeEach(() => {
    vi.resetModules();
    mockListAllCompletos.mockReset();
  });

  it('inclui documentos das tabelas mesmo quando o snapshot esta stale', async () => {
    mockListAllCompletos.mockResolvedValue({
      source: 'tables',
      documentos: [
        {
          id: 'db32cd23-c9de-4c2d-ac81-0090d8d7cdb8',
          numero: '6100-2043-EM-014-50099',
          revisao: '1',
          data: '2026-09-14',
          descricao: 'OTIMIZAÇÃO DA LINHA C',
          responsavel: 'R',
          status: 'pendente',
          itens: [
            {
              id: 'i1',
              codigo: 'MAT-NEW',
              descricao: 'Material novo',
              unidade: 'UN',
              quantidade: 10,
              quantidadeAtendida: 0,
              localizacao: '',
            },
          ],
        },
      ],
    });

    const { carregarTodosDocumentosOrdenados } = await import('./documentos.service');
    const result = await carregarTodosDocumentosOrdenados();

    expect(result.success).toBe(true);
    expect(result.data?.some((d) => d.numero === '6100-2043-EM-014-50099')).toBe(true);
    expect(result.data?.some((d) => d.numero === 'DOC-STALE')).toBe(false);
    expect(mockListAllCompletos).toHaveBeenCalled();
  });
});
