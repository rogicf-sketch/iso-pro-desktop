import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  authorizeMobileDevice,
  blockMobileDevice,
  getMobileDeviceIndicators,
  listMobileDevices,
  revokeMobileDevice,
  unblockMobileDevice,
} from '../services/mobileDevices.service';
import type { MobileDevice, MobileDeviceFilter } from '../types/mobileDevice.types';

export type PendingMobileConfirm =
  | null
  | { kind: 'authorize' | 'block' | 'unblock' | 'revoke'; id: string };

const initialFilters: MobileDeviceFilter = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 10,
};

export function useMobileDevices() {
  const { canAccessAction } = useAuth();
  const [items, setItems] = useState<MobileDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MobileDeviceFilter>(initialFilters);
  const [indicators, setIndicators] = useState({
    total: 0,
    autorizados: 0,
    pendentes: 0,
    bloqueados: 0,
  });
  const [syncSource, setSyncSource] = useState<'supabase' | 'local'>('local');
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingMobileConfirm>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [devices, nextIndicators] = await Promise.all([
        listMobileDevices(filters),
        getMobileDeviceIndicators(),
      ]);

      setItems(devices.items);
      setTotal(devices.total);
      setIndicators(nextIndicators);
      setSyncSource(devices.source === 'supabase' || nextIndicators.source === 'supabase' ? 'supabase' : 'local');
      setSyncWarning(devices.warning ?? nextIndicators.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dispositivos mobile.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar dispositivo mobile.');
    } finally {
      setConfirmLoading(false);
    }
  }, [pendingConfirm, load, total, items.length, filters.page]);

  const updateFilters = useCallback((next: MobileDeviceFilter) => {
    setFilters(next);
  }, []);

  return {
    items,
    total,
    loading,
    error,
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
