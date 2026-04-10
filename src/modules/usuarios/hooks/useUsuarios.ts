import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportAuthAuditEventsCsv, listAuthAuditEvents, type AuthAuditEvent } from '../../auth/services/authAudit.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { buscarUsuarioPorId, listarModulosDisponiveis, listarPerfisAcesso, listarUsuarios, salvarUsuario, toggleUsuarioStatus } from '../services/usuarios.service';
import type { UsuarioFiltro, UsuarioFormData, UsuarioPerfil, UsuarioSistema } from '../types/usuario.types';

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
  permissoes: listarModulosDisponiveis().map((item) => ({ ...item, permitido: false })),
};

export function useUsuarios() {
  const { canAccessAction } = useAuth();
  const [items, setItems] = useState<UsuarioSistema[]>([]);
  const [profiles, setProfiles] = useState<UsuarioPerfil[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<UsuarioFiltro>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [auditItems, setAuditItems] = useState<AuthAuditEvent[]>([]);
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState<'todos' | AuthAuditEvent['type']>('todos');
  const [auditPeriodFilter, setAuditPeriodFilter] = useState<'todos' | '24h' | '7d' | '30d'>('todos');
  const [auditReferenceTime, setAuditReferenceTime] = useState(() => Date.now());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<UsuarioSistema | null>(null);
  const [selectedForm, setSelectedForm] = useState<UsuarioFormData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    const [usersResult, profileItems] = await Promise.all([listarUsuarios(filters), listarPerfisAcesso()]);
    setProfiles(profileItems);
    setAuditItems(listAuthAuditEvents());

    if (!usersResult.success || !usersResult.data) {
      setError(usersResult.error ?? 'Nao foi possivel carregar usuarios.');
      setItems([]);
      setTotal(0);
    } else {
      setItems(usersResult.data.items);
      setTotal(usersResult.data.total);
    }

    setLoading(false);
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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
    setIsModalOpen(true);
  }

  async function submitUsuario(data: UsuarioFormData) {
    if (!canAccessAction('usuarios', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar usuarios.' };
    }
    const result = await salvarUsuario(data, selected?.id);
    if (result.success) {
      setSuccess('Usuario salvo com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      setSelectedForm(null);
      await load();
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
    setSuccess('Status do usuario atualizado com sucesso.');
    await load();
  }

  return {
    items,
    profiles,
    total,
    filters,
    loading,
    error,
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
  };
}
