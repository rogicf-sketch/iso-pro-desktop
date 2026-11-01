import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialogProvider';
import { listaBuscaDebounceMs } from '../../../lib/listaBuscaDebounce';
import { getActiveTenantId, ISO_PRO_DEFAULT_TENANT_ID, type IsoProTenantListItem } from '../../../lib/isoProTenant';
import { useAuth } from '../../auth/hooks/useAuth';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { getVolatileSessionPassword } from '../../auth/services/auth.service';
import { listDesktopLicenseRegistry } from '../services/desktopLicenseRegistry.service';
import { updateDesktopLicenseRegistryStatus } from '../services/desktopSecurity.service';
import {
  fetchSuperAdminLicenseCapabilities,
  listDesktopLicensesAsSuperAdmin,
  setDesktopLicenseStatusAsSuperAdmin,
} from '../services/isoProDesktopLicense.service';
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
  const { confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const actorSenha = getVolatileSessionPassword() ?? '';
  const onDefaultTenant = getActiveTenantId() === ISO_PRO_DEFAULT_TENANT_ID;

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'active' | 'revoked'>('todos');
  const [periodFilter, setPeriodFilter] = useState<'todos' | '30d' | '90d' | 'expirando'>('todos');
  const [tenantFilter, setTenantFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [bootClock] = useState(() => Date.now());
  const [superAdmin, setSuperAdmin] = useState(false);
  const [privateKeyConfigured, setPrivateKeyConfigured] = useState(false);
  const [tenants, setTenants] = useState<IsoProTenantListItem[]>([]);
  const [capabilitiesHint, setCapabilitiesHint] = useState('');

  const debouncedSearchTerm = useDebouncedValue(searchTerm, listaBuscaDebounceMs(searchTerm));

  useEffect(() => {
    let cancelled = false;
    async function loadCapabilities() {
      if (!onDefaultTenant || !user?.login || !actorSenha || !canAccessAction('configuracoes', 'administrar')) {
        if (!cancelled) {
          setSuperAdmin(false);
          setPrivateKeyConfigured(false);
          setTenants([]);
          setCapabilitiesHint('');
        }
        return;
      }
      const result = await fetchSuperAdminLicenseCapabilities({
        actorLogin: user.login,
        actorSenha,
      });
      if (cancelled) return;
      if (!result.success || !result.data?.superAdmin) {
        setSuperAdmin(false);
        setPrivateKeyConfigured(false);
        setTenants([]);
        setCapabilitiesHint(result.error ?? '');
        return;
      }
      setSuperAdmin(true);
      setPrivateKeyConfigured(result.data.privateKeyConfigured);
      setTenants(result.data.tenants);
      setCapabilitiesHint('');
    }
    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [actorSenha, canAccessAction, onDefaultTenant, user?.login]);

  const listQueryKey = [
    'desktop-licenses',
    'registry',
    user?.login,
    superAdmin ? 'super' : 'tenant',
    tenantFilter,
  ] as const;

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => {
      if (superAdmin && user?.login && actorSenha) {
        const result = await listDesktopLicensesAsSuperAdmin({
          actorLogin: user.login,
          actorSenha,
          tenantId: tenantFilter === 'todos' ? undefined : tenantFilter,
        });
        if (!result.success) {
          throw new Error(result.error ?? 'Nao foi possivel carregar licencas (super-admin).');
        }
        return {
          items: result.data ?? [],
          currentTime: Date.now(),
          syncSource: 'supabase' as const,
          syncWarning: '',
        };
      }

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
    enabled: Boolean(user?.login),
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
    if (!(await confirm({ message: confirmation, danger: status === 'revoked' }))) {
      return;
    }

    if (superAdmin && item.tenantId && user?.login && actorSenha) {
      const result = await setDesktopLicenseStatusAsSuperAdmin({
        actorLogin: user.login,
        actorSenha,
        tenantId: item.tenantId,
        licenseId: item.licenseId,
        status,
      });
      if (!result.success) {
        setError(result.error ?? 'Nao foi possivel atualizar o status da licenca.');
        return;
      }
    } else {
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
    }

    appendAuthAuditEvent({
      type: status === 'revoked' ? 'desktop_license_revoked' : 'desktop_license_restored',
      actorLogin: user?.login ?? 'sistema',
      targetLogin: item.issuedTo,
      detail:
        status === 'revoked'
          ? `Licenca ${item.licenseId} revogada centralmente${item.tenantName ? ` (${item.tenantName})` : ''}.`
          : `Licenca ${item.licenseId} reativada centralmente${item.tenantName ? ` (${item.tenantName})` : ''}.`,
    });

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

      const haystack = [
        item.issuedTo,
        item.licenseId,
        item.machineLabel,
        item.machineFingerprint,
        item.appVersion,
        item.motivoRevogacao,
        item.tenantName,
        item.tenantSlug,
      ]
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
      [
        'tenantName',
        'tenantId',
        'licenseId',
        'issuedTo',
        'machineFingerprint',
        'machineLabel',
        'appVersion',
        'status',
        'emitidaEm',
        'expiraEm',
        'revogadaEm',
        'motivoRevogacao',
      ].join(','),
      ...filteredItems.map((item) =>
        [
          escape(item.tenantName ?? ''),
          escape(item.tenantId ?? ''),
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
    tenantFilter,
    searchTerm,
    page,
    pageSize,
    superAdmin,
    privateKeyConfigured,
    tenants,
    capabilitiesHint,
    actorLogin: user?.login ?? '',
    actorSenha,
    onDefaultTenant,
    setStatusFilter: (value: 'todos' | 'active' | 'revoked') => {
      setStatusFilter(value);
      setPage(1);
    },
    setPeriodFilter: (value: 'todos' | '30d' | '90d' | 'expirando') => {
      setPeriodFilter(value);
      setPage(1);
    },
    setTenantFilter: (value: string) => {
      setTenantFilter(value);
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
