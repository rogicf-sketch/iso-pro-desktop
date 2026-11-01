/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileDevices } from './useMobileDevices';

const mocks = vi.hoisted(() => ({
  listMobileDevices: vi.fn(),
  getMobileDeviceIndicators: vi.fn(),
  deleteMobileDevice: vi.fn(),
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

vi.mock('../services/mobileDevices.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/mobileDevices.service')>();
  return {
    ...mod,
    listMobileDevices: mocks.listMobileDevices,
    getMobileDeviceIndicators: mocks.getMobileDeviceIndicators,
    deleteMobileDevice: mocks.deleteMobileDevice,
  };
});

let testQueryClient: QueryClient;

function TestQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>;
}

describe('useMobileDevices — lista', () => {
  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.listMobileDevices.mockReset();
    mocks.getMobileDeviceIndicators.mockReset();
    mocks.deleteMobileDevice.mockReset();
  });

  it('carrega lista e indicadores apos sucesso', async () => {
    mocks.listMobileDevices.mockResolvedValue({
      items: [],
      total: 0,
      source: 'local',
      warning: null,
    });
    mocks.getMobileDeviceIndicators.mockResolvedValue({
      total: 0,
      autorizados: 0,
      pendentes: 0,
      bloqueados: 0,
      source: 'local',
      warning: null,
    });

    const { result } = renderHook(() => useMobileDevices(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.total).toBe(0);
    expect(result.current.indicators.total).toBe(0);
    expect(mocks.listMobileDevices).toHaveBeenCalled();
    expect(mocks.getMobileDeviceIndicators).toHaveBeenCalled();
  });

  it('handleDelete pede confirmacao e apaga o registo', async () => {
    mocks.listMobileDevices.mockResolvedValue({
      items: [{ id: 'd1' }],
      total: 1,
      source: 'local',
      warning: null,
    });
    mocks.getMobileDeviceIndicators.mockResolvedValue({
      total: 1,
      autorizados: 1,
      pendentes: 0,
      bloqueados: 0,
      source: 'local',
      warning: null,
    });
    mocks.deleteMobileDevice.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMobileDevices(), { wrapper: TestQueryProvider });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.handleDelete('d1');
    });
    expect(result.current.pendingConfirm).toEqual({ kind: 'delete', id: 'd1' });

    await act(async () => {
      await result.current.confirmPendingAction();
    });

    expect(mocks.deleteMobileDevice).toHaveBeenCalledWith('d1');
    await waitFor(() => {
      expect(result.current.pendingConfirm).toBeNull();
    });
  });
});
