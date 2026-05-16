/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEtiquetas } from './useEtiquetas';

const mocks = vi.hoisted(() => ({
  listarEtiquetas: vi.fn(),
}));

vi.mock('../../auth/hooks/useAuth', () => ({
  useAuth: () => ({
    canAccessAction: () => true,
    user: undefined,
  }),
}));

vi.mock('../services/etiquetas.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/etiquetas.service')>();
  return {
    ...mod,
    listarEtiquetas: mocks.listarEtiquetas,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useEtiquetas — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarEtiquetas.mockReset();
  });

  it('carrega itens e total apos sucesso', async () => {
    mocks.listarEtiquetas.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'etq-1',
            titulo: 'Etq',
            codigo: 'C',
            modelo: 'industrial',
            formato: 'a4_2col',
            larguraMm: 100,
            alturaMm: 50,
            moduloOrigem: 'livre',
            referenciaId: 'r',
            quantidadeCopias: 1,
            status: 'pronta',
            criadoPor: 'Admin',
            dataCriacao: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 8,
      },
    });

    const { result } = renderHook(() => useEtiquetas(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.codigo).toBe('C');
    expect(result.current.total).toBe(1);
    expect(mocks.listarEtiquetas).toHaveBeenCalled();
  });
});
