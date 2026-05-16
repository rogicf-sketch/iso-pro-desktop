/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMateriais } from './useMateriais';

const mocks = vi.hoisted(() => ({
  listarMateriais: vi.fn(),
  listarDisciplinas: vi.fn(),
  listarUnidadesCadastro: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
  shouldUseCloudMaterials: vi.fn(() => false),
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

vi.mock('../services/materiaisReferencias.service', () => ({
  analisarUsoMateriaisPorIds: vi.fn(() => Promise.resolve([])),
  formatarUsoMateriaisResumoTexto: vi.fn(() => ''),
}));

vi.mock('../utils/materiaisImportStagingStorage', () => ({
  loadPersistedMateriaisImportStaging: vi.fn(() => null),
  persistMateriaisImportStaging: vi.fn(),
}));

vi.mock('../services/materiais.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/materiais.service')>();
  return {
    ...mod,
    listarMateriais: mocks.listarMateriais,
    listarDisciplinas: mocks.listarDisciplinas,
    listarUnidadesCadastro: mocks.listarUnidadesCadastro,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useMateriais — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listarMateriais.mockReset();
    mocks.listarDisciplinas.mockReset();
    mocks.listarUnidadesCadastro.mockReset();
  });

  it('carrega itens, total, disciplinas e unidades apos sucesso', async () => {
    mocks.listarMateriais.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'mat-1',
            codigo: 'TB-1',
            codigoBarras: '',
            descricao: 'Tubo',
            disciplina: 'Tub',
            unidade: 'UN',
            peso: 1,
            estoqueMinimo: 0,
            saldoAtual: 5,
            ativo: true,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 8,
      },
    });
    mocks.listarDisciplinas.mockResolvedValue(['Tubulacao']);
    mocks.listarUnidadesCadastro.mockResolvedValue(['UN', 'M']);

    const { result } = renderHook(() => useMateriais(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.codigo).toBe('TB-1');
    expect(result.current.total).toBe(1);
    expect(result.current.disciplinas).toEqual(['Tubulacao']);
    expect(result.current.unidades).toEqual(['UN', 'M']);
    expect(mocks.listarMateriais).toHaveBeenCalled();
    expect(mocks.listarDisciplinas).toHaveBeenCalled();
    expect(mocks.listarUnidadesCadastro).toHaveBeenCalled();
  });
});
