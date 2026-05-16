import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  atualizarStatusEtiqueta,
  buscarEtiquetaPorId,
  getEtiquetaPreset,
  listarEtiquetas,
  listarEtiquetasPorIds,
  listarIdsEtiquetasFiltradas,
  podeAtualizarStatusEtiqueta,
  salvarEtiqueta,
  validateEtiqueta,
} from '../services/etiquetas.service';
import type { Etiqueta, EtiquetaFiltro, EtiquetaFormData, EtiquetaFormato, EtiquetaListItem, EtiquetaModelo } from '../types/etiqueta.types';

const initialFilters: EtiquetaFiltro = {
  busca: '',
  modelo: 'todos',
  formato: 'todos',
  status: 'todos',
  page: 1,
  pageSize: 8,
};

const initialPreset = getEtiquetaPreset('industrial', 'a4_2col');
const emptyForm: EtiquetaFormData = {
  titulo: '',
  codigo: '',
  descricao: '',
  modelo: 'industrial',
  formato: 'a4_2col',
  larguraMm: initialPreset.larguraMm,
  alturaMm: initialPreset.alturaMm,
  moduloOrigem: 'livre',
  referenciaId: '',
  quantidadeCopias: 1,
  criadoPor: 'Administrador',
  observacoes: '',
};

function etiquetasListaQueryKey(filters: EtiquetaFiltro, userLogin: string | undefined) {
  return ['etiquetas', 'lista', userLogin ?? '', filters] as const;
}

export function useEtiquetas() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const [filters, setFilters] = useState<EtiquetaFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Etiqueta | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const etiquetaFilterKey = `${filters.busca}\u0001${filters.modelo}\u0001${filters.formato}\u0001${filters.status}`;
  const [prevEtiquetaFilterKey, setPrevEtiquetaFilterKey] = useState(etiquetaFilterKey);
  if (etiquetaFilterKey !== prevEtiquetaFilterKey) {
    setPrevEtiquetaFilterKey(etiquetaFilterKey);
    setSelectedIds(new Set());
  }

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: etiquetasListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarEtiquetas(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar etiquetas.');
      }
      return { items: result.data.items, total: result.data.total };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Nao foi possivel carregar etiquetas.'
        : '';

  const invalidateEtiquetasLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['etiquetas'] });
  }, [queryClient]);

  const formInitialValue = useMemo<EtiquetaFormData>(
    () =>
      selected
        ? {
            titulo: selected.titulo,
            codigo: selected.codigo,
            descricao: selected.descricao,
            modelo: selected.modelo,
            formato: selected.formato,
            larguraMm: selected.larguraMm,
            alturaMm: selected.alturaMm,
            moduloOrigem: selected.moduloOrigem,
            referenciaId: selected.referenciaId,
            quantidadeCopias: selected.quantidadeCopias,
            criadoPor: selected.criadoPor,
            observacoes: selected.observacoes,
          }
        : { ...emptyForm, criadoPor: user?.nome ?? 'Administrador' },
    [selected, user],
  );

  function applyPreset(modelo: EtiquetaModelo, formato: EtiquetaFormato) {
    const preset = getEtiquetaPreset(modelo, formato);
    return preset;
  }

  async function submitEtiqueta(data: EtiquetaFormData) {
    if (!canAccessAction('etiquetas', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar etiquetas.' };
    }
    const validationError = validateEtiqueta(data);
    if (validationError) return { success: false, error: validationError };
    const result = await salvarEtiqueta(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateEtiquetasLista();
      setSuccess('Etiqueta salva com sucesso.');
    }
    return result;
  }

  function toggleSelectEtiqueta(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPaginaAtual() {
    const allOnPage = items.length > 0 && items.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPage) {
        for (const it of items) next.delete(it.id);
      } else {
        for (const it of items) next.add(it.id);
      }
      return next;
    });
  }

  async function selecionarTodosFiltrados() {
    const ids = await listarIdsEtiquetasFiltradas({
      busca: filtersForLista.busca,
      modelo: filtersForLista.modelo,
      formato: filtersForLista.formato,
      status: filtersForLista.status,
    });
    setSelectedIds(new Set(ids));
  }

  function limparSelecaoEtiquetas() {
    setSelectedIds(new Set());
  }

  async function handleStatus(item: EtiquetaListItem, status: Etiqueta['status']) {
    if (!canAccessAction('etiquetas', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar etiquetas.');
      return;
    }
    const bloqueio = podeAtualizarStatusEtiqueta(item, status);
    if (bloqueio) {
      setError(bloqueio);
      return;
    }
    if (
      !window.confirm(
        status === 'cancelada'
          ? `Confirma o cancelamento da etiqueta ${item.codigo}?`
          : `Confirma a alteracao da etiqueta ${item.codigo} para ${status}?`,
      )
    ) {
      return;
    }
    const result = await atualizarStatusEtiqueta(item.id, status);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel atualizar o status da etiqueta.');
      return;
    }
    await invalidateEtiquetasLista();
    setSuccess('Status da etiqueta atualizado com sucesso.');
  }

  async function handleStatusEmLote(status: Etiqueta['status']) {
    if (!canAccessAction('etiquetas', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar etiquetas.');
      return;
    }
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      setError('Selecione ao menos uma etiqueta.');
      return;
    }
    const etiquetas = listarEtiquetasPorIds(ids);
    const elegiveis = etiquetas.filter((e) => podeAtualizarStatusEtiqueta(e, status) === null);
    if (!elegiveis.length) {
      setError('Nenhuma etiqueta selecionada pode receber este status.');
      return;
    }
    const acao =
      status === 'impressa'
        ? `marcar ${elegiveis.length} etiqueta(s) como impressa(s)`
        : `cancelar ${elegiveis.length} etiqueta(s)`;
    if (!window.confirm(`Confirma ${acao}?`)) return;
    setError('');
    for (const e of elegiveis) {
      const result = await atualizarStatusEtiqueta(e.id, status);
      if (!result.success) {
        setError(result.error ?? 'Falha ao atualizar etiqueta em lote.');
        await invalidateEtiquetasLista();
        return;
      }
    }
    setSuccess(
      status === 'impressa'
        ? `${elegiveis.length} etiqueta(s) marcada(s) como impressa(s).`
        : `${elegiveis.length} etiqueta(s) cancelada(s).`,
    );
    setSelectedIds(new Set());
    await invalidateEtiquetasLista();
  }

  return {
    items,
    total,
    loading,
    error: error || listError,
    success,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    applyPreset,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('etiquetas', 'editar')) {
        setError('Seu perfil nao possui permissao para criar etiquetas.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: async (item: EtiquetaListItem) => {
      if (!canAccessAction('etiquetas', 'editar')) {
        setError('Seu perfil nao possui permissao para editar etiquetas.');
        return;
      }
      const result = await buscarEtiquetaPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar a etiqueta.');
        return;
      }
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitEtiqueta,
    handleStatus,
    selectedIds,
    toggleSelectEtiqueta,
    toggleSelectAllPaginaAtual,
    selecionarTodosFiltrados,
    limparSelecaoEtiquetas,
    handleStatusEmLote,
  };
}
