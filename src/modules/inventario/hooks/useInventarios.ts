import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  buscarInventarioPorId,
  fecharInventario,
  listarInventarios,
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
  observacoes: '',
  itens: [],
};

export function useInventarios() {
  const { canAccessAction } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<InventarioFiltro>(initialFilters);
  const [items, setItems] = useState<InventarioListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Inventario | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const result = await listarInventarios(filters);

    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar inventarios.');
      setItems([]);
      setTotal(0);
      setFallbackReason('');
    } else {
      setItems(result.data.items);
      setTotal(result.data.total);
      setFallbackReason(result.meta?.fallbackReason ?? '');
    }

    setLoading(false);
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const formInitialValue = useMemo<InventarioFormData>(
    () =>
      selected
        ? {
            codigo: selected.codigo,
            descricao: selected.descricao,
            responsavel: selected.responsavel,
            dataInventario: selected.dataInventario,
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
      setSuccess(result.meta?.source === 'local' ? 'Inventario salvo localmente.' : 'Inventario salvo com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      await load();
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
    setSuccess(result.meta?.source === 'local' ? 'Inventario fechado localmente.' : 'Inventario fechado com sucesso.');
    await load();
  }

  return {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load,
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
  };
}
