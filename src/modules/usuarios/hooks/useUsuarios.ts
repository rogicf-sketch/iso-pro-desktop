import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { exportAuthAuditEventsCsv, listAuthAuditEvents, type AuthAuditEvent } from '../../auth/services/authAudit.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { buscarUsuarioPorId, listarModulosDisponiveis, listarPerfisAcesso, listarUsuarios, salvarUsuario, toggleUsuarioStatus } from '../services/usuarios.service';
import type { UsuarioFiltro, UsuarioFormData, UsuarioSistema } from '../types/usuario.types';

const initialFilters: UsuarioFiltro = {
  busca: '',
  status: 'todos',
  perfilId: '',
  page: 1,
  pageSize: 10,
};

const emptyForm: UsuarioFormData = {
  login: '',
  nome: '',
  senha: '',
  ativo: true,
  perfilId: '',
  colaboradorId: null,
  authUserIdSupabase: null,
  permissoes: listarModulosDisponiveis().map((item) => ({ ...item, permitido: false })),
};

function usuariosListaQueryKey(filters: UsuarioFiltro, userLogin: string | undefined) {
  return ['usuarios', 'lista', userLogin ?? '', filters] as const;
}

export function useUsuarios() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const [filters, setFilters] = useState<UsuarioFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<'todos' | AuthAuditEvent['type']>('todos');
  const [auditPeriodFilter, setAuditPeriodFilter] = useState<'todos' | '24h' | '7d' | '30d'>('todos');
  const [auditReferenceTime, setAuditReferenceTime] = useState(() => Date.now());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<UsuarioSistema | null>(null);
  const [selectedForm, setSelectedForm] = useState<UsuarioFormData | null>(null);
  /** Incrementa ao abrir modal ou ao recarregar o utilizador na nuvem — força remount do formulario com `key`. */
  const [usuarioFormInstance, setUsuarioFormInstance] = useState(0);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: usuariosListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const [usersResult, profileItems] = await Promise.all([listarUsuarios(filtersForLista), listarPerfisAcesso()]);
      if (!usersResult.success || !usersResult.data) {
        throw new Error(usersResult.error ?? 'Nao foi possivel carregar usuarios.');
      }
      return {
        items: usersResult.data.items,
        total: usersResult.data.total,
        profiles: profileItems,
        auditItems: listAuthAuditEvents(),
      };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;
  const rawProfiles = listQuery.data?.profiles;
  const profiles = useMemo(() => rawProfiles ?? [], [rawProfiles]);
  const rawAuditItems = listQuery.data?.auditItems;
  const auditItems = useMemo(() => rawAuditItems ?? [], [rawAuditItems]);
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Nao foi possivel carregar usuarios.'
        : '';

  const invalidateUsuariosLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
  }, [queryClient]);

  const refreshSelectedUsuarioForm = useCallback(async () => {
    if (!selected) return;
    const r = await buscarUsuarioPorId(selected.id);
    if (r.success && r.data) {
      setSelectedForm(r.data);
      setUsuarioFormInstance((n) => n + 1);
    }
  }, [selected]);

  const formInitialValue = useMemo<UsuarioFormData>(() => {
    if (!selected) {
      return {
        ...emptyForm,
        perfilId: profiles[0]?.id ?? '',
        permissoes: profiles[0]?.permissoes ?? emptyForm.permissoes,
      };
    }

    return selectedForm ?? emptyForm;
  }, [profiles, selected, selectedForm]);

  const filteredAuditItems = useMemo(() => {
    return auditItems.filter((item) => {
      const matchesType = auditTypeFilter === 'todos' || item.type === auditTypeFilter;
      const actorSearch = auditActorFilter.trim().toLowerCase();
      const matchesActor =
        !actorSearch ||
        item.actorLogin.toLowerCase().includes(actorSearch) ||
        (item.targetLogin ?? '').toLowerCase().includes(actorSearch);
      const itemTime = new Date(item.createdAt).getTime();
      const matchesPeriod =
        auditPeriodFilter === 'todos' ||
        (auditPeriodFilter === '24h' && auditReferenceTime - itemTime <= 24 * 60 * 60 * 1000) ||
        (auditPeriodFilter === '7d' && auditReferenceTime - itemTime <= 7 * 24 * 60 * 60 * 1000) ||
        (auditPeriodFilter === '30d' && auditReferenceTime - itemTime <= 30 * 24 * 60 * 60 * 1000);

      return matchesType && matchesActor && matchesPeriod;
    });
  }, [auditActorFilter, auditItems, auditPeriodFilter, auditReferenceTime, auditTypeFilter]);

  function exportAudit() {
    exportAuthAuditEventsCsv(filteredAuditItems);
    setSuccess('Auditoria exportada com sucesso.');
  }

  function handleAuditPeriodFilterChange(value: 'todos' | '24h' | '7d' | '30d') {
    setAuditPeriodFilter(value);
    setAuditReferenceTime(Date.now());
  }

  async function openEditModal(item: UsuarioSistema) {
    if (!canAccessAction('usuarios', 'editar')) {
      setError('Seu perfil nao possui permissao para editar usuarios.');
      return;
    }
    const result = await buscarUsuarioPorId(item.id);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar o usuario.');
      return;
    }
    setSelected(item);
    setSelectedForm(result.data);
    setUsuarioFormInstance((n) => n + 1);
    setIsModalOpen(true);
  }

  async function submitUsuario(data: UsuarioFormData) {
    if (!canAccessAction('usuarios', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar usuarios.' };
    }
    const result = await salvarUsuario(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      setSelectedForm(null);
      await invalidateUsuariosLista();
      setSuccess('Usuario salvo com sucesso.');
    }
    return result;
  }

  async function handleToggleStatus(item: UsuarioSistema) {
    if (!canAccessAction('usuarios', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar usuarios.');
      return;
    }
    if (!window.confirm(`Confirma ${item.ativo ? 'desativar' : 'ativar'} o usuario ${item.login}?`)) {
      return;
    }
    const result = await toggleUsuarioStatus(item.id, !item.ativo);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel atualizar usuario.');
      return;
    }
    await invalidateUsuariosLista();
    setSuccess('Status do usuario atualizado com sucesso.');
  }

  return {
    items,
    profiles,
    total,
    filters,
    loading,
    error: error || listError,
    success,
    auditItems: filteredAuditItems,
    auditActorFilter,
    auditTypeFilter,
    auditPeriodFilter,
    isModalOpen,
    selected,
    formInitialValue,
    setFilters,
    setAuditActorFilter,
    setAuditTypeFilter,
    setAuditPeriodFilter: handleAuditPeriodFilterChange,
    exportAudit,
    openCreateModal: () => {
      if (!canAccessAction('usuarios', 'editar')) {
        setError('Seu perfil nao possui permissao para criar usuarios.');
        return;
      }
      setSelected(null);
      setSelectedForm(null);
      setUsuarioFormInstance((n) => n + 1);
      setIsModalOpen(true);
    },
    openEditModal,
    closeModal: () => {
      setSelected(null);
      setSelectedForm(null);
      setIsModalOpen(false);
    },
    submitUsuario,
    handleToggleStatus,
    refreshSelectedUsuarioForm,
    usuarioFormInstance,
  };
}
