import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { useAuth } from '../../auth/hooks/useAuth';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { listDesktopLicenseRegistry } from '../services/desktopLicenseRegistry.service';
import { updateDesktopLicenseRegistryStatus } from '../services/desktopSecurity.service';
import type { DesktopLicenseRegistryItem } from '../types/desktop-license-registry.types';

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function useDesktopLicenses() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const listQueryKey = ['desktop-licenses', 'registry', user?.login] as const;
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'active' | 'revoked'>('todos');
  const [periodFilter, setPeriodFilter] = useState<'todos' | '30d' | '90d' | 'expirando'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  /** Instante fixo de montagem — usado até existir `currentTime` vindo da query. */
  const [bootClock] = useState(() => Date.now());

  const debouncedSearchTerm = useDebouncedValue(searchTerm, LISTA_BUSCA_DEBOUNCE_MS);

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => {
      const result = await listDesktopLicenseRegistry();
      if (!result.success) {
        throw new Error(result.error ?? 'Nao foi possivel carregar licencas desktop.');
      }
      return {
        items: result.data ?? [],
        currentTime: Date.now(),
        syncSource: (result.meta?.source ?? 'local') as 'supabase' | 'local',
        syncWarning: result.meta?.fallbackReason ?? '',
      };
    },
  });

  const rawItems = listQuery.data?.items;
  const items = useMemo(() => rawItems ?? [], [rawItems]);

  const currentTime = listQuery.data?.currentTime ?? bootClock;

  const loading = listQuery.isLoading;
  const syncSource = listQuery.data?.syncSource ?? 'local';
  const syncWarning = listQuery.data?.syncWarning ?? '';
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Nao foi possivel carregar licencas desktop.'
        : '';

  const reload = useCallback(async () => {
    setError('');
    await queryClient.invalidateQueries({ queryKey: ['desktop-licenses'] });
  }, [queryClient]);

  async function handleStatusChange(item: DesktopLicenseRegistryItem, status: 'active' | 'revoked') {
    setError('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar licencas desktop.');
      return;
    }

    const confirmation =
      status === 'revoked'
        ? 'Confirma revogar centralmente a licenca desktop selecionada?'
        : 'Confirma reativar centralmente a licenca desktop selecionada?';
    if (!window.confirm(confirmation)) {
      return;
    }

    const tokenPayload = {
      licenseId: item.licenseId,
      issuedTo: item.issuedTo,
      machineFingerprint: item.machineFingerprint,
      machineLabel: item.machineLabel || undefined,
      issuedAt: item.emitidaEm,
      expiresAt: item.expiraEm || undefined,
      appVersion: item.appVersion || undefined,
      status,
    };
    const encodedPayload = encodeBase64Url(JSON.stringify(tokenPayload));
    const fakeToken = `${encodedPayload}.registry-only`;

    const result = await updateDesktopLicenseRegistryStatus(fakeToken, status);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel atualizar o status da licenca desktop.');
      return;
    }

    appendAuthAuditEvent({
      type: status === 'revoked' ? 'desktop_license_revoked' : 'desktop_license_restored',
      actorLogin: user?.login ?? 'sistema',
      targetLogin: item.issuedTo,
      detail:
        status === 'revoked'
          ? `Licenca ${item.licenseId} revogada centralmente no painel de licencas desktop.`
          : `Licenca ${item.licenseId} reativada centralmente no painel de licencas desktop.`,
    });

    queryClient.setQueryData(listQueryKey, (prev) =>
      prev ? { ...prev, currentTime: Date.now() } : prev,
    );
    await queryClient.invalidateQueries({ queryKey: ['desktop-licenses'] });
    setSuccess(status === 'revoked' ? 'Licenca desktop revogada com sucesso.' : 'Licenca desktop reativada com sucesso.');
  }

  const filteredItems = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLocaleLowerCase();
    const thirtyDaysAgo = currentTime - 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgo = currentTime - 90 * 24 * 60 * 60 * 1000;
    const expiringThreshold = currentTime + 30 * 24 * 60 * 60 * 1000;

    return items.filter((item) => {
      const matchesStatus = statusFilter === 'todos' || item.status === statusFilter;
      if (!matchesStatus) return false;

      const issuedAt = item.emitidaEm ? new Date(item.emitidaEm).getTime() : 0;
      const expiresAt = item.expiraEm ? new Date(item.expiraEm).getTime() : 0;
      const matchesPeriod =
        periodFilter === 'todos'
          ? true
          : periodFilter === '30d'
            ? Boolean(issuedAt && issuedAt >= thirtyDaysAgo)
            : periodFilter === '90d'
              ? Boolean(issuedAt && issuedAt >= ninetyDaysAgo)
              : Boolean(expiresAt && expiresAt >= currentTime && expiresAt <= expiringThreshold);
      if (!matchesPeriod) return false;

      if (!normalizedSearch) return true;

      const haystack = [item.issuedTo, item.licenseId, item.machineLabel, item.machineFingerprint, item.appVersion, item.motivoRevogacao]
        .join(' ')
        .toLocaleLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [currentTime, debouncedSearchTerm, items, periodFilter, statusFilter]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const riskIndicators = useMemo(() => {
    let expired = 0;
    let expiringSoon = 0;
    let missingMachineLabel = 0;

    items.forEach((item) => {
      const expiresAt = item.expiraEm ? new Date(item.expiraEm).getTime() : 0;
      if (expiresAt && expiresAt < currentTime) {
        expired += 1;
      } else if (expiresAt && expiresAt <= currentTime + 30 * 24 * 60 * 60 * 1000) {
        expiringSoon += 1;
      }

      if (!item.machineLabel.trim()) {
        missingMachineLabel += 1;
      }
    });

    return {
      expired,
      expiringSoon,
      missingMachineLabel,
    };
  }, [currentTime, items]);

  function exportLicenses() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      ['licenseId', 'issuedTo', 'machineFingerprint', 'machineLabel', 'appVersion', 'status', 'emitidaEm', 'expiraEm', 'revogadaEm', 'motivoRevogacao'].join(','),
      ...filteredItems.map((item) =>
        [
          escape(item.licenseId),
          escape(item.issuedTo),
          escape(item.machineFingerprint),
          escape(item.machineLabel),
          escape(item.appVersion),
          escape(item.status),
          escape(item.emitidaEm),
          escape(item.expiraEm),
          escape(item.revogadaEm),
          escape(item.motivoRevogacao),
        ].join(','),
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `licencas-desktop-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return {
    items,
    filteredItems,
    paginatedItems,
    loading,
    error: error || listError,
    success,
    syncSource,
    syncWarning,
    riskIndicators,
    statusFilter,
    periodFilter,
    searchTerm,
    page,
    pageSize,
    setStatusFilter: (value: 'todos' | 'active' | 'revoked') => {
      setStatusFilter(value);
      setPage(1);
    },
    setPeriodFilter: (value: 'todos' | '30d' | '90d' | 'expirando') => {
      setPeriodFilter(value);
      setPage(1);
    },
    setSearchTerm: (value: string) => {
      setSearchTerm(value);
      setPage(1);
    },
    setPage,
    reload,
    exportLicenses,
    handleRevoke: (item: DesktopLicenseRegistryItem) => void handleStatusChange(item, 'revoked'),
    handleRestore: (item: DesktopLicenseRegistryItem) => void handleStatusChange(item, 'active'),
  };
}
