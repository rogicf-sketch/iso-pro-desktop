import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  buscarColaboradorPorId,
  importarColaboradoresDoArquivoCsv,
  listarColaboradores,
  montarExportacaoColaboradoresCsv,
  salvarColaborador,
  toggleColaboradorStatus,
} from '../services/colaboradores.service';
import {
  montarModeloCsvImportacaoColaboradores,
  previewImportacaoColaboradoresCsv,
  type ResultadoImportacaoColaboradoresCsv,
} from '../services/colaboradores.import.csv';
import { validateColaborador } from '../schemas/colaborador.schema';
import type { Colaborador, ColaboradorFiltro, ColaboradorFormData } from '../types/colaborador.types';

const initialFilters: ColaboradorFiltro = {
  busca: '',
  tipo: 'todos',
  status: 'todos',
  page: 1,
  pageSize: 8,
};

const emptyForm: ColaboradorFormData = {
  nome: '',
  tipo: 'interno',
  matricula: '',
  funcao: '',
  empresa: 'ISO PRO',
  documento: '',
  telefone: '',
  observacao: '',
  ativo: true,
};

function colaboradoresListaQueryKey(filters: ColaboradorFiltro, userLogin: string | undefined) {
  return ['colaboradores', 'lista', userLogin ?? '', filters] as const;
}

export function useColaboradores() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<ColaboradorFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Colaborador | null>(null);
  const [importStaging, setImportStaging] = useState<{ fileName: string; text: string; linhaCount: number } | null>(null);
  const [importingColaboradores, setImportingColaboradores] = useState(false);
  const [importResultado, setImportResultado] = useState<ResultadoImportacaoColaboradoresCsv | null>(null);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: colaboradoresListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarColaboradores(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar colaboradores.');
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
        ? 'Nao foi possivel carregar colaboradores.'
        : '';

  const invalidateColaboradoresLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['colaboradores'] });
  }, [queryClient]);

  const formInitialValue = useMemo<ColaboradorFormData>(
    () =>
      selected
        ? {
            nome: selected.nome,
            tipo: selected.tipo,
            matricula: selected.matricula,
            funcao: selected.funcao,
            empresa: selected.empresa,
            documento: selected.documento,
            telefone: selected.telefone,
            observacao: selected.observacao,
            ativo: selected.ativo,
          }
        : emptyForm,
    [selected],
  );

  async function submitColaborador(data: ColaboradorFormData) {
    if (!canAccessAction('colaboradores', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar colaboradores.' };
    }
    const validationError = validateColaborador(data);
    if (validationError) return { success: false, error: validationError };
    const result = await salvarColaborador(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateColaboradoresLista();
      setSuccess(result.meta?.source === 'local' ? 'Colaborador salvo localmente.' : 'Colaborador salvo com sucesso.');
    }
    return result;
  }

  async function handleToggleStatus(item: Colaborador) {
    if (!canAccessAction('colaboradores', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar colaboradores.');
      return;
    }
    const result = await toggleColaboradorStatus(item.id, !item.ativo);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel atualizar colaborador.');
      return;
    }
    await invalidateColaboradoresLista();
    setSuccess(result.meta?.source === 'local' ? 'Status do colaborador atualizado localmente.' : 'Status do colaborador atualizado com sucesso.');
  }

  function baixarModeloCsvImportacaoColaboradores() {
    if (!canAccessAction('colaboradores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar colaboradores.');
      return;
    }
    setError('');
    const { csv, fileName } = montarModeloCsvImportacaoColaboradores();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess('Modelo CSV de importacao baixado. Edite e use em Importar Excel (CSV).');
  }

  function openImportColaboradoresPicker() {
    if (!canAccessAction('colaboradores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar colaboradores.');
      return;
    }
    setError('');
    importInputRef.current?.click();
  }

  async function stageImportColaboradoresFromFile(file: File | null) {
    if (!file) return;
    if (!canAccessAction('colaboradores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar colaboradores.');
      return;
    }
    setError('');
    setSuccess('');
    setImportResultado(null);

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && file.type !== 'text/csv' && !lower.endsWith('.txt')) {
      setError('Selecione um arquivo CSV (exportado do Excel ou do modelo deste modulo).');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('Nao foi possivel ler o arquivo selecionado.');
      return;
    }

    const preview = previewImportacaoColaboradoresCsv(text);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportStaging({ fileName: file.name, text, linhaCount: preview.linhaCount });
  }

  function cancelImportColaboradoresStaging() {
    if (importingColaboradores) return;
    setImportStaging(null);
  }

  function closeImportColaboradoresResultado() {
    setImportResultado(null);
  }

  async function confirmImportColaboradoresStaging() {
    if (!importStaging) return;
    if (!canAccessAction('colaboradores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar colaboradores.');
      return;
    }
    setError('');
    setSuccess('');
    setImportingColaboradores(true);
    const text = importStaging.text;

    const result = await importarColaboradoresDoArquivoCsv(text);
    setImportingColaboradores(false);
    setImportStaging(null);

    if (!result.success) {
      setError(result.error ?? 'Importacao nao concluida.');
      return;
    }

    const r = result.data;
    if (!r) {
      setError('Resumo da importacao indisponivel.');
      return;
    }
    await invalidateColaboradoresLista();
    setImportResultado(r);
  }

  async function exportColaboradoresCsv() {
    if (!canAccessAction('colaboradores', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar colaboradores.');
      return;
    }
    setError('');
    const result = await montarExportacaoColaboradoresCsv();
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar a planilha.');
      return;
    }
    const url = URL.createObjectURL(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.data.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess('Exportacao Excel (CSV) — todos os colaboradores concluida.');
  }

  async function exportColaboradoresCsvFiltrado() {
    if (!canAccessAction('colaboradores', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar colaboradores.');
      return;
    }
    setError('');
    const result = await montarExportacaoColaboradoresCsv({ filtroLista: filtersForLista });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar a planilha.');
      return;
    }
    const url = URL.createObjectURL(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.data.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess('Exportacao Excel (CSV) — filtro atual da lista concluida.');
  }

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
    load: invalidateColaboradoresLista,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('colaboradores', 'editar')) {
        setError('Seu perfil nao possui permissao para criar colaboradores.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: async (item: Colaborador) => {
      if (!canAccessAction('colaboradores', 'editar')) {
        setError('Seu perfil nao possui permissao para editar colaboradores.');
        return;
      }
      const result = await buscarColaboradorPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o colaborador.');
        return;
      }
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitColaborador,
    handleToggleStatus,
    importInputRef,
    importStaging,
    importingColaboradores,
    importResultado,
    openImportColaboradoresPicker,
    baixarModeloCsvImportacaoColaboradores,
    stageImportColaboradoresFromFile,
    cancelImportColaboradoresStaging,
    confirmImportColaboradoresStaging,
    closeImportColaboradoresResultado,
    exportColaboradoresCsv,
    exportColaboradoresCsvFiltrado,
  };
}
