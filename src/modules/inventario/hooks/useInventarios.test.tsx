/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInventarios } from './useInventarios';

const mocks = vi.hoisted(() => ({
  listarInventarios: vi.fn(),
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

vi.mock('../services/inventario.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/inventario.service')>();
  return {
    ...mod,
    listarInventarios: mocks.listarInventarios,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useInventarios — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarInventarios.mockReset();
  });

  it('carrega itens e total apos sucesso', async () => {
    mocks.listarInventarios.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'inv-1',
            codigo: 'INV-2026-001',
            descricao: 'Geral',
            responsavel: 'R',
            dataInventario: '2026-04-01',
            status: 'aberto',
            totalItens: 2,
            divergencias: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 6,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useInventarios(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.codigo).toBe('INV-2026-001');
    expect(result.current.total).toBe(1);
    expect(mocks.listarInventarios).toHaveBeenCalled();
  });
});
