import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  authorizeMobileDevice,
  blockMobileDevice,
  getMobileDeviceIndicators,
  listMobileDevices,
  revokeMobileDevice,
  unblockMobileDevice,
} from '../services/mobileDevices.service';
import type { MobileDeviceFilter } from '../types/mobileDevice.types';

export type PendingMobileConfirm =
  | null
  | { kind: 'authorize' | 'block' | 'unblock' | 'revoke'; id: string };

const initialFilters: MobileDeviceFilter = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 10,
};

function mobileDevicesListaQueryKey(filters: MobileDeviceFilter, userLogin: string | undefined) {
  return ['mobile', 'devices', userLogin ?? '', filters] as const;
}

export function useMobileDevices() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MobileDeviceFilter>(initialFilters);
  const [pendingConfirm, setPendingConfirm] = useState<PendingMobileConfirm>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: mobileDevicesListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const [devices, nextIndicators] = await Promise.all([
        listMobileDevices(filtersForLista),
        getMobileDeviceIndicators(),
      ]);
      return {
        items: devices.items,
        total: devices.total,
        indicators: nextIndicators,
        syncSource: (devices.source === 'supabase' || nextIndicators.source === 'supabase' ? 'supabase' : 'local') as
          | 'supabase'
          | 'local',
        syncWarning: devices.warning ?? nextIndicators.warning,
      };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;
  const indicators = listQuery.data?.indicators ?? { total: 0, autorizados: 0, pendentes: 0, bloqueados: 0 };
  const syncSource = listQuery.data?.syncSource ?? 'local';
  const syncWarning = listQuery.data?.syncWarning ?? null;
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Falha ao carregar dispositivos mobile.'
        : null;

  const invalidateMobileDevices = useCallback(async () => {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ['mobile'] });
  }, [queryClient]);

  const reload = useCallback(async () => {
    await invalidateMobileDevices();
  }, [invalidateMobileDevices]);

  const guardAdminOrSetError = useCallback((): boolean => {
    if (!canAccessAction('mobile', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar dispositivos mobile.');
      return false;
    }
    return true;
  }, [canAccessAction]);

  const handleAuthorize = useCallback(
    (id: string) => {
      setError(null);
      if (!guardAdminOrSetError()) return;
      setPendingConfirm({ kind: 'authorize', id });
    },
    [guardAdminOrSetError],
  );

  const handleBlock = useCallback(
    (id: string) => {
      setError(null);
      if (!guardAdminOrSetError()) return;
      setPendingConfirm({ kind: 'block', id });
    },
    [guardAdminOrSetError],
  );

  const handleUnblock = useCallback(
    (id: string) => {
      setError(null);
      if (!guardAdminOrSetError()) return;
      setPendingConfirm({ kind: 'unblock', id });
    },
    [guardAdminOrSetError],
  );

  const handleRevoke = useCallback(
    (id: string) => {
      setError(null);
      if (!guardAdminOrSetError()) return;
      setPendingConfirm({ kind: 'revoke', id });
    },
    [guardAdminOrSetError],
  );

  const cancelPendingConfirmation = useCallback(() => {
    if (confirmLoading) return;
    setPendingConfirm(null);
  }, [confirmLoading]);

  const confirmPendingAction = useCallback(async () => {
    if (!pendingConfirm) return;
    const { kind, id } = pendingConfirm;
    setConfirmLoading(true);
    setError(null);
    try {
      switch (kind) {
        case 'authorize':
          await authorizeMobileDevice(id);
          break;
        case 'block':
          await blockMobileDevice(id);
          break;
        case 'unblock':
          await unblockMobileDevice(id);
          break;
        case 'revoke':
          await revokeMobileDevice(id);
          break;
        default:
          break;
      }
      setPendingConfirm(null);
      if (kind === 'revoke') {
        const nextPage = total > 1 && items.length === 1 && filters.page > 1 ? filters.page - 1 : filters.page;
        if (nextPage !== filters.page) {
          setFilters((prev) => ({ ...prev, page: nextPage }));
          return;
        }
      }
      await invalidateMobileDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar dispositivo mobile.');
    } finally {
      setConfirmLoading(false);
    }
  }, [pendingConfirm, invalidateMobileDevices, total, items.length, filters.page]);

  const updateFilters = useCallback((next: MobileDeviceFilter) => {
    setFilters(next);
  }, []);

  return {
    items,
    total,
    loading,
    error: error ?? listError,
    filters,
    indicators,
    syncSource,
    syncWarning,
    setFilters: updateFilters,
    reload,
    handleAuthorize,
    handleBlock,
    handleUnblock,
    handleRevoke,
    pendingConfirm,
    confirmPendingAction,
    cancelPendingConfirmation,
    confirmLoading,
  };
}
