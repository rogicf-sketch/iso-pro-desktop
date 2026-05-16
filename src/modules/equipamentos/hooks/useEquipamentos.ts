import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  excluirEquipamento,
  listarEquipamentos,
  montarExportacaoEquipamentosCsv,
  obterIndicadoresEquipamentos,
  salvarEquipamento,
} from '../services/equipamentos.service';
import type { Equipamento, EquipamentoFiltro, EquipamentoFormData } from '../types/equipamento.types';

const initialFilters: EquipamentoFiltro = {
  busca: '',
  statusOperacao: 'todos',
  situacaoContrato: 'todos',
  page: 1,
  pageSize: 8,
};

const emptyForm: EquipamentoFormData = {
  codigo: '',
  tipoEquipamento: '',
  placa: '',
  nomeOperador: '',
  telefoneOperador: '',
  setorResponsavel: '',
  empresaContratada: '',
  dataInicioProjeto: '',
  dataFimContrato: '',
  valorContrato: null,
  numeroContrato: '',
  statusEquipamento: 'operando',
  observacoes: '',
};

function equipamentosListaQueryKey(filters: EquipamentoFiltro, userLogin: string | undefined) {
  return ['equipamentos', 'lista', userLogin ?? '', filters] as const;
}

function equipamentosIndicadoresQueryKey(userLogin: string | undefined) {
  return ['equipamentos', 'indicadores', userLogin ?? ''] as const;
}

export function useEquipamentos() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<EquipamentoFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Equipamento | null>(null);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: equipamentosListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarEquipamentos(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Não foi possível carregar equipamentos.');
      }
      return {
        items: result.data.items,
        total: result.data.total,
        fallbackReason: result.meta?.fallbackReason ?? '',
      };
    },
  });

  const indicadoresQuery = useQuery({
    queryKey: equipamentosIndicadoresQueryKey(user?.login),
    queryFn: async () => {
      const result = await obterIndicadoresEquipamentos();
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Não foi possível carregar indicadores.');
      }
      return {
        data: result.data,
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
        ? 'Não foi possível carregar equipamentos.'
        : '';

  const indicadores = indicadoresQuery.data?.data;
  const indicadoresLoading = indicadoresQuery.isLoading;
  const indicadoresError =
    indicadoresQuery.isError && indicadoresQuery.error instanceof Error
      ? indicadoresQuery.error.message
      : indicadoresQuery.isError
        ? 'Não foi possível carregar indicadores.'
        : '';

  const invalidateLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['equipamentos'] });
  }, [queryClient]);

  const formInitialValue = useMemo<EquipamentoFormData>(
    () =>
      selected
        ? {
            codigo: selected.codigo,
            tipoEquipamento: selected.tipoEquipamento,
            placa: selected.placa,
            nomeOperador: selected.nomeOperador,
            telefoneOperador: selected.telefoneOperador,
            setorResponsavel: selected.setorResponsavel,
            empresaContratada: selected.empresaContratada,
            dataInicioProjeto: selected.dataInicioProjeto,
            dataFimContrato: selected.dataFimContrato,
            valorContrato: selected.valorContrato,
            numeroContrato: selected.numeroContrato,
            statusEquipamento: selected.statusEquipamento,
            observacoes: selected.observacoes,
          }
        : emptyForm,
    [selected],
  );

  async function submitEquipamento(data: EquipamentoFormData) {
    if (!canAccessAction('equipamentos', 'editar')) {
      return { success: false, error: 'Seu perfil não possui permissão para editar equipamentos.' };
    }
    const result = await salvarEquipamento(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateLista();
      setSuccess(result.meta?.source === 'local' ? 'Equipamento salvo localmente.' : 'Equipamento salvo com sucesso.');
    }
    return result;
  }

  const exportEquipamentosCsv = useCallback(async () => {
    setError('');
    const result = await montarExportacaoEquipamentosCsv(filtersForLista);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Não foi possível gerar o CSV.');
      return;
    }
    const { csv, fileName } = result.data;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filtersForLista]);

  const removerEquipamento = useCallback(
    async (id: string) => {
      if (!canAccessAction('equipamentos', 'editar')) {
        setError('Seu perfil não possui permissão para excluir equipamentos.');
        return;
      }
      if (!window.confirm('Excluir este equipamento? Esta ação não pode ser desfeita.')) {
        return;
      }
      const result = await excluirEquipamento(id);
      if (!result.success) {
        setError(result.error ?? 'Não foi possível excluir o equipamento.');
        return;
      }
      await invalidateLista();
      setSuccess('Equipamento excluído.');
    },
    [canAccessAction, invalidateLista],
  );

  const openCreateModal = useCallback(() => {
    setSelected(null);
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((item: Equipamento) => {
    setSelected(item);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelected(null);
  }, []);

  return {
    items,
    total,
    loading,
    indicadores,
    indicadoresLoading,
    error: error || listError || indicadoresError,
    success,
    fallbackReason,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load: invalidateLista,
    submitEquipamento,
    exportEquipamentosCsv,
    removerEquipamento,
  };
}
