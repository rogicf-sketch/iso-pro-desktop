/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtendimentoDocumento } from '../types/atendimento.types';
import { obterErroRegistroAtendimento, reterDocumentosProtegidos, useAtendimento } from './useAtendimento';

const mocks = vi.hoisted(() => ({
  listarDocumentosPendentesComMeta: vi.fn(),
  listarHistoricoAtendimentosComMeta: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
}));

vi.mock('../../auth/hooks/useAuth', () => ({
  useAuth: () => ({
    canAccessAction: () => true,
    user: undefined,
  }),
}));

vi.mock('../../colaboradores/services/colaboradores.service', () => ({
  listarColaboradoresAtivos: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../materiais/services/materiais.service', () => ({
  buscarMaterialPorLeituraCodigo: vi.fn(() => Promise.resolve({ success: true, data: null })),
}));

vi.mock('../services/atendimento.service', () => ({
  aquecerBaselineAtendimentoNuvem: vi.fn(() => Promise.resolve()),
  listarDocumentosPendentesComMeta: mocks.listarDocumentosPendentesComMeta,
  listarHistoricoAtendimentosComMeta: mocks.listarHistoricoAtendimentosComMeta,
  montarExportacaoAtendimentosPacoteZip: vi.fn(() =>
    Promise.resolve({ success: true, data: { zipBlob: new Blob(['zip']), fileName: 't.zip' } }),
  ),
  estornarAtendimento: vi.fn(),
  registrarAtendimento: vi.fn(),
  registrarAtendimentosSessao: vi.fn(),
  buscarDocumentosPendentesPorCodigoMaterialNuvem: vi.fn(),
}));

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

function buildDoc(): AtendimentoDocumento {
  return {
    id: 'doc-1',
    numero: 'N1',
    revisao: 'A',
    descricao: 'Teste',
    responsavel: 'R',
    status: 'pendente',
    linhas: [
      {
        documentoItemId: 'item-1',
        materialId: null,
        codigoMaterial: 'M1',
        descricaoMaterial: 'Mat',
        unidade: 'UN',
        quantidadeProjeto: 10,
        quantidadeAtendida: 0,
        quantidadePendente: 10,
        saldoDisponivel: 4,
        quantidadeNestaOperacao: 0,
      },
    ],
  };
}

describe('useAtendimento — sugestao de quantidade', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('preenche quantidade sugerida ao selecionar documento apos o carregamento', async () => {
    mocks.listarDocumentosPendentesComMeta.mockResolvedValue({
      success: true,
      data: [buildDoc()],
    });
    mocks.listarHistoricoAtendimentosComMeta.mockResolvedValue({
      success: true,
      data: [],
    });

    const { result } = renderHook(() => useAtendimento(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setSelectedDocumentoId('doc-1');
    });

    await waitFor(() => {
      expect(result.current.selectedDocumento?.linhas[0]?.quantidadeNestaOperacao).toBe(4);
    });
    expect(result.current.idsMarcados.has('item-1')).toBe(true);
  });

  it('nao sobrescreve quantidade ao editar depois do preenchimento automatico', async () => {
    mocks.listarDocumentosPendentesComMeta.mockResolvedValue({
      success: true,
      data: [buildDoc()],
    });
    mocks.listarHistoricoAtendimentosComMeta.mockResolvedValue({
      success: true,
      data: [],
    });

    const { result } = renderHook(() => useAtendimento(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setSelectedDocumentoId('doc-1');
    });

    await waitFor(() => {
      expect(result.current.selectedDocumento?.linhas[0]?.quantidadeNestaOperacao).toBe(4);
    });

    act(() => {
      result.current.updateLinha('item-1', 2);
    });

    expect(result.current.selectedDocumento?.linhas[0]?.quantidadeNestaOperacao).toBe(2);
  });

  it('aplica sugestao quando o documento e selecionado antes da lista chegar', async () => {
    let releaseDocs!: (v: { success: boolean; data: AtendimentoDocumento[] }) => void;
    const docsGate = new Promise<{ success: boolean; data: AtendimentoDocumento[] }>((resolve) => {
      releaseDocs = resolve;
    });

    mocks.listarDocumentosPendentesComMeta.mockReturnValue(docsGate);
    mocks.listarHistoricoAtendimentosComMeta.mockResolvedValue({
      success: true,
      data: [],
    });

    const { result } = renderHook(() => useAtendimento(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    act(() => {
      result.current.setSelectedDocumentoId('doc-1');
    });

    await act(async () => {
      releaseDocs({ success: true, data: [buildDoc()] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.selectedDocumento?.linhas[0]?.quantidadeNestaOperacao).toBe(4);
    });
  });
});

describe('obterErroRegistroAtendimento', () => {
  it('retorna null quando interno com colaborador e itens validos', () => {
    const doc = buildDoc();
    const linha = { ...doc.linhas[0], quantidadeNestaOperacao: 4 };
    const d = { ...doc, linhas: [linha] };
    const ids = new Set(['item-1']);
    expect(
      obterErroRegistroAtendimento(d, 'Op', 'interno', 'colab-1', '', '', '', '', '', '', [linha], ids),
    ).toBeNull();
  });

  it('exige colaborador interno selecionado', () => {
    const doc = buildDoc();
    const linha = { ...doc.linhas[0], quantidadeNestaOperacao: 4 };
    const d = { ...doc, linhas: [linha] };
    const ids = new Set(['item-1']);
    expect(
      obterErroRegistroAtendimento(d, 'Op', 'interno', '', '', '', '', '', '', '', [linha], ids),
    ).toMatch(/colaborador interno/);
  });

  it('exige campos do retirante externo', () => {
    const doc = buildDoc();
    const linha = { ...doc.linhas[0], quantidadeNestaOperacao: 4 };
    const d = { ...doc, linhas: [linha] };
    const ids = new Set(['item-1']);
    expect(
      obterErroRegistroAtendimento(d, 'Op', 'externo', '', 'N', '', 'RG', '', '', '', [linha], ids),
    ).toMatch(/retirante externo/);
  });
});

describe('reterDocumentosProtegidos', () => {
  it('reanexa documento da sessao que o refetch descartou (fora dos primeiros pendentes do boot)', () => {
    const docBoot = buildDoc();
    const docRemoto = { ...buildDoc(), id: 'doc-remoto', numero: 'N9' };
    const prev = [docBoot, docRemoto];
    const baseRefetch = [docBoot];
    const out = reterDocumentosProtegidos(prev, baseRefetch, new Set(['doc-remoto']));
    expect(out.map((d) => d.id)).toEqual(['doc-1', 'doc-remoto']);
  });

  it('sem protegidos ou sem faltantes devolve a base intacta', () => {
    const docBoot = buildDoc();
    const base = [docBoot];
    expect(reterDocumentosProtegidos([docBoot], base, new Set())).toBe(base);
    expect(reterDocumentosProtegidos([docBoot], base, new Set(['doc-1']))).toBe(base);
  });
});
