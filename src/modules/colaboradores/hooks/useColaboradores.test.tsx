/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useColaboradores } from './useColaboradores';

const mocks = vi.hoisted(() => ({
  listarColaboradores: vi.fn(),
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

vi.mock('../services/colaboradores.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/colaboradores.service')>();
  return {
    ...mod,
    listarColaboradores: mocks.listarColaboradores,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useColaboradores — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarColaboradores.mockReset();
  });

  it('carrega itens e total apos sucesso', async () => {
    mocks.listarColaboradores.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'col-1',
            nome: 'Joao',
            tipo: 'interno',
            matricula: '1',
            funcao: 'F',
            empresa: 'E',
            documento: '',
            telefone: '',
            observacao: '',
            ativo: true,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 8,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useColaboradores(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.nome).toBe('Joao');
    expect(result.current.total).toBe(1);
    expect(mocks.listarColaboradores).toHaveBeenCalled();
  });
});
