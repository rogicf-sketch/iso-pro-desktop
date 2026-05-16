import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  buscarInventarioPorId,
  fecharInventario,
  listarInventarios,
  montarExportacaoInventarioCsv,
  salvarInventario,
  validateInventario,
} from '../services/inventario.service';
import type { Inventario, InventarioFiltro, InventarioFormData, InventarioListItem } from '../types/inventario.types';

const initialFilters: InventarioFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 6,
};

const emptyForm: InventarioFormData = {
  codigo: '',
  descricao: '',
  responsavel: '',
  dataInventario: new Date().toISOString().slice(0, 10),
  contagemMobileHabilitada: false,
  observacoes: '',
  itens: [],
};

function inventariosListaQueryKey(filters: InventarioFiltro, userLogin: string | undefined) {
  return ['inventario', 'lista', userLogin ?? '', filters] as const;
}

export function useInventarios() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<InventarioFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Inventario | null>(null);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: inventariosListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarInventarios(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar inventarios.');
      }
      return {
        items: result.data.items,
        total: result.data.total,
        fallbackReason: result.meta?.fallbackReason ?? '',
      };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;
  const fallbackReason = listQuery.data?.fallbackReason ?? '';
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Nao foi possivel carregar inventarios.'
        : '';

  const invalidateInventariosLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['inventario'] });
  }, [queryClient]);

  const formInitialValue = useMemo<InventarioFormData>(
    () =>
      selected
        ? {
            codigo: selected.codigo,
            descricao: selected.descricao,
            responsavel: selected.responsavel,
            dataInventario: selected.dataInventario,
            contagemMobileHabilitada: selected.contagemMobileHabilitada,
            observacoes: selected.observacoes,
            itens: selected.itens,
          }
        : emptyForm,
    [selected],
  );

  async function submitInventario(data: InventarioFormData) {
    if (!canAccessAction('inventario', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar inventarios.' };
    }
    const validationError = validateInventario(data);
    if (validationError) return { success: false, error: validationError };

    const duplicatedCodes = new Set<string>();
    for (const item of data.itens) {
      const code = item.codigoMaterial.trim().toLowerCase();
      if (duplicatedCodes.has(code)) {
        return { success: false, error: `Nao e permitido repetir o material ${item.codigoMaterial} no mesmo inventario.` };
      }
      duplicatedCodes.add(code);
    }

    const result = await salvarInventario(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateInventariosLista();
      setSuccess(result.meta?.source === 'local' ? 'Inventario salvo localmente.' : 'Inventario salvo com sucesso.');
    }

    return result;
  }

  async function handleFechar(item: InventarioListItem) {
    if (!canAccessAction('inventario', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar inventarios.');
      return;
    }
    if (item.status === 'fechado') {
      setError('Este inventario ja esta fechado.');
      return;
    }
    if (item.status === 'cancelado') {
      setError('Inventarios cancelados nao podem ser fechados.');
      return;
    }
    if (
      !window.confirm(
        `Confirma fechar o inventario ${item.codigo}? Itens: ${item.totalItens}. Divergencias registradas: ${item.divergencias}.`,
      )
    ) {
      return;
    }
    const result = await fecharInventario(item.id);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel fechar inventario.');
      return;
    }
    await invalidateInventariosLista();
    setSuccess(result.meta?.source === 'local' ? 'Inventario fechado localmente.' : 'Inventario fechado com sucesso.');
  }

  const exportarInventarioCsv = useCallback(
    async (item: InventarioListItem) => {
      if (!canAccessAction('inventario', 'visualizar')) {
        setError('Seu perfil nao possui permissao para exportar inventarios.');
        return;
      }
      if (item.status !== 'fechado') {
        setError('Apenas inventarios fechados podem ser exportados.');
        return;
      }
      setError('');
      setSuccess('');
      const result = await montarExportacaoInventarioCsv(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel gerar o arquivo.');
        return;
      }
      const { csv, fileName } = result.data;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setSuccess('Exportacao gerada. Verifique a pasta de downloads.');
    },
    [canAccessAction],
  );

  return {
    items,
    total,
    loading,
    error: error || listError,
    success,
    fallbackReason,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load: invalidateInventariosLista,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('inventario', 'editar')) {
        setError('Seu perfil nao possui permissao para criar inventarios.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: async (item: InventarioListItem) => {
      if (!canAccessAction('inventario', 'editar')) {
        setError('Seu perfil nao possui permissao para editar inventarios.');
        return;
      }
      if (item.status !== 'aberto') {
        setError('Apenas inventarios em aberto podem ser editados.');
        return;
      }
      const result = await buscarInventarioPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o inventario.');
        return;
      }
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitInventario,
    handleFechar,
    exportarInventarioCsv,
  };
}
