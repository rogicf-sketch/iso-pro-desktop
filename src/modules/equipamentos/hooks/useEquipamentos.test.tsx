/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEquipamentos } from './useEquipamentos';

const mocks = vi.hoisted(() => ({
  listarEquipamentos: vi.fn(),
  obterIndicadoresEquipamentos: vi.fn(),
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

vi.mock('../services/equipamentos.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/equipamentos.service')>();
  return {
    ...mod,
    listarEquipamentos: mocks.listarEquipamentos,
    obterIndicadoresEquipamentos: mocks.obterIndicadoresEquipamentos,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useEquipamentos — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarEquipamentos.mockReset();
    mocks.obterIndicadoresEquipamentos.mockReset();
    mocks.obterIndicadoresEquipamentos.mockResolvedValue({
      success: true,
      data: {
        total: 1,
        proximosVencer30: 0,
        contratosVencidos: 0,
        emOperacao: 1,
      },
      meta: { source: 'local' as const },
    });
  });

  it('carrega itens após sucesso', async () => {
    mocks.listarEquipamentos.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'eq-1',
            codigo: 'E1',
            tipoEquipamento: 'Tipo',
            placa: 'ABC-1',
            nomeOperador: 'Op',
            telefoneOperador: '',
            setorResponsavel: 'S',
            empresaContratada: 'Emp',
            dataInicioProjeto: '',
            dataFimContrato: '',
            valorContrato: null,
            numeroContrato: '',
            statusEquipamento: 'operando',
            observacoes: '',
            dataCadastro: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 8,
      },
      meta: { source: 'local' as const },
    });

    const { result } = renderHook(() => useEquipamentos(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.tipoEquipamento).toBe('Tipo');
    expect(mocks.listarEquipamentos).toHaveBeenCalled();
    expect(mocks.obterIndicadoresEquipamentos).toHaveBeenCalled();
  });
});
