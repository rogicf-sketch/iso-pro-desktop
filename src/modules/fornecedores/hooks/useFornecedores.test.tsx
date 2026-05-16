/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFornecedores } from './useFornecedores';

const mocks = vi.hoisted(() => ({
  listarFornecedores: vi.fn(),
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

vi.mock('../services/fornecedores.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/fornecedores.service')>();
  return {
    ...mod,
    listarFornecedores: mocks.listarFornecedores,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useFornecedores — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarFornecedores.mockReset();
  });

  it('carrega itens e total apos sucesso', async () => {
    mocks.listarFornecedores.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'for-1',
            nome: 'Fornecedor X',
            cnpj: '1',
            telefone: 't',
            email: 'e',
            endereco: 'x',
            ativo: true,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 8,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useFornecedores(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.nome).toBe('Fornecedor X');
    expect(result.current.total).toBe(1);
    expect(mocks.listarFornecedores).toHaveBeenCalled();
  });
});
