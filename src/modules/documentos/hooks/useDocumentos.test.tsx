/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentos } from './useDocumentos';

const mocks = vi.hoisted(() => ({
  listarDocumentos: vi.fn(),
  diagnosticarPlanejamentoLocalVersusNuvem: vi.fn(() =>
    Promise.resolve({ noNavegador: 0, noSnapshot: 0 }),
  ),
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

vi.mock('../../auth/services/auth.service', () => ({
  verifyCurrentUserPassword: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('../../materiais/services/materiais.service', () => ({
  validarCodigosMateriaisAtivosNoCadastroParaRecebimento: vi.fn(),
}));

vi.mock('../services/documentos.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/documentos.service')>();
  return {
    ...mod,
    listarDocumentos: mocks.listarDocumentos,
    diagnosticarPlanejamentoLocalVersusNuvem: mocks.diagnosticarPlanejamentoLocalVersusNuvem,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useDocumentos — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarDocumentos.mockReset();
    mocks.diagnosticarPlanejamentoLocalVersusNuvem.mockClear();
  });

  it('carrega itens e total apos sucesso do servico', async () => {
    mocks.listarDocumentos.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'doc-1',
            numero: 'DOC-1',
            revisao: 'A',
            descricao: 'Teste',
            responsavel: 'R',
            dataDocumento: '2026-04-01',
            status: 'pendente',
            totalItens: 1,
            quantidadePlanejada: 10,
            quantidadeAtendida: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 6,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useDocumentos(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.numero).toBe('DOC-1');
    expect(result.current.total).toBe(1);
    expect(mocks.listarDocumentos).toHaveBeenCalled();
    expect(mocks.diagnosticarPlanejamentoLocalVersusNuvem).toHaveBeenCalled();
  });
});
