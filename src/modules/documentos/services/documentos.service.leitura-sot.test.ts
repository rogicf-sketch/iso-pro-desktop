import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadPayload = vi.fn();
const mockReadDocumentoPlanejamentoFromCloud = vi.fn();

vi.mock('../../../lib/snapshotSliceRead', () => ({
  readSnapshotRemoteSliceOrFull: (keys: readonly unknown[]) => mockReadPayload(keys),
}));

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
    readDocumentoPlanejamentoFromCloud: (...args: unknown[]) => mockReadDocumentoPlanejamentoFromCloud(...args),
  };
});

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  carregarRecebimentosCompletos: vi.fn(async () => []),
}));

vi.mock('../../materiais/services/materiais.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../materiais/services/materiais.service')>();
  return {
    ...actual,
    listarMateriais: vi.fn(async () => ({ success: true, data: [] })),
    carregarMateriaisDoCadastro: vi.fn(async () => []),
  };
});

describe('buscarDocumentoPorIdOuNumero — prioridade tabelas SoT', () => {
  beforeEach(() => {
    vi.resetModules();
    mockReadPayload.mockReset();
    mockReadDocumentoPlanejamentoFromCloud.mockReset();
  });

  it('usa quantidadeAtendida das tabelas quando o snapshot reconciliado ainda esta zerado', async () => {
    mockReadPayload.mockResolvedValue({
      documentos: [
        {
          id: 'doc-8',
          numero: 'E.RAZN010-IE6-00008-ABOVE SPDA',
          revisao: 'B',
          itens: [{ id: 'i1', codigo: 'MAT001', quantidade: 100, quantidadeAtendida: 0 }],
        },
      ],
      atendimentos: [],
      atendimentoHistorico: [],
    });

    mockReadDocumentoPlanejamentoFromCloud.mockResolvedValue({
      documento: {
        id: 'doc-8',
        numero: 'E.RAZN010-IE6-00008-ABOVE SPDA',
        revisao: 'B',
        data: '2026-01-01',
        itens: [{ id: 'i1', codigo: 'MAT001', quantidade: 100, quantidadeAtendida: 72 }],
      },
      source: 'tables',
    });

    const { buscarDocumentoPorIdOuNumero } = await import('./documentos.service');
    const result = await buscarDocumentoPorIdOuNumero('doc-8', null);

    expect(result.success).toBe(true);
    expect(result.data?.itens[0]?.quantidadeAtendida).toBe(72);
    expect(mockReadDocumentoPlanejamentoFromCloud).toHaveBeenCalled();
  });
});
