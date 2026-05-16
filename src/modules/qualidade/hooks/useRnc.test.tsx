/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRnc } from './useRnc';

const mocks = vi.hoisted(() => ({
  listarRnc: vi.fn(),
}));

vi.mock('../../../lib/collectAllPages', () => ({
  collectAllPages: vi.fn(async () => []),
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

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => ({
    rncPrefSenha: '',
  })),
}));

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  listarRecebimentos: vi.fn(async () => ({
    success: true,
    data: { items: [], total: 0, page: 1, pageSize: 6 },
  })),
}));

vi.mock('../services/qualidade.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/qualidade.service')>();
  return {
    ...mod,
    listarRnc: mocks.listarRnc,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useRnc — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarRnc.mockReset();
  });

  it('carrega lista apos sucesso', async () => {
    mocks.listarRnc.mockResolvedValue({
      success: true,
      data: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 6,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useRnc(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(mocks.listarRnc).toHaveBeenCalled();
  });
});
