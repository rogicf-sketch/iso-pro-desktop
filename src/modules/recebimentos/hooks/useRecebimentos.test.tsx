/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecebimentos } from './useRecebimentos';

const mocks = vi.hoisted(() => ({
  listarRecebimentos: vi.fn(),
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

vi.mock('../../fornecedores/services/fornecedores.service', () => ({
  resolverNomeFornecedorCadastradoAtivo: vi.fn(),
  validarNomesFornecedoresCadastradosAtivos: vi.fn(),
}));

vi.mock('../../materiais/services/materiais.service', () => ({
  validarCodigosMateriaisAtivosNoCadastroParaRecebimento: vi.fn(),
  construirIndicePesoPorCodigoMaterial: vi.fn(() => Promise.resolve(new Map())),
  construirIndiceDisciplinaUnidadePorCodigoMaterial: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('../services/recebimentos.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/recebimentos.service')>();
  return {
    ...mod,
    listarRecebimentos: mocks.listarRecebimentos,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useRecebimentos — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarRecebimentos.mockReset();
  });

  it('carrega itens e total apos sucesso do servico', async () => {
    mocks.listarRecebimentos.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'rec-1',
            fornecedor: 'F',
            dataRecebimento: '2026-04-01',
            notaFiscal: 'NF-1',
            romaneio: '',
            conferente: 'C',
            modoRecebimento: 'direto',
            status: 'conferido',
            totalItens: 1,
            quantidadeRecebidaTotal: 1,
            quantidadeConferidaTotal: 1,
            conferenciaItensDivergentes: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 6,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useRecebimentos(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.id).toBe('rec-1');
    expect(result.current.total).toBe(1);
    expect(mocks.listarRecebimentos).toHaveBeenCalled();
  });
});
