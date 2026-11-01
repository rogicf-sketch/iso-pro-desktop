import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useStaleWhileRevalidateListaRetry } from '../../../hooks/useStaleWhileRevalidateListaRetry';
import { listaBuscaDebounceMs } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  buscarFornecedorPorId,
  importarFornecedoresDoArquivoCsv,
  listarFornecedores,
  montarExportacaoFornecedoresCsv,
  salvarFornecedor,
  toggleFornecedorStatus,
} from '../services/fornecedores.service';
import {
  montarModeloCsvImportacaoFornecedores,
  previewImportacaoFornecedoresCsv,
  type ResultadoImportacaoFornecedoresCsv,
} from '../services/fornecedores.import.csv';
import { validateFornecedor } from '../schemas/fornecedor.schema';
import type { Fornecedor, FornecedorFiltro, FornecedorFormData } from '../types/fornecedor.types';

const initialFilters: FornecedorFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 8,
};

const emptyForm: FornecedorFormData = {
  nome: '',
  cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  ativo: true,
};

function fornecedoresListaQueryKey(filters: FornecedorFiltro, userLogin: string | undefined) {
  return ['fornecedores', 'lista', userLogin ?? '', filters] as const;
}

export function useFornecedores() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<FornecedorFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Fornecedor | null>(null);
  const [importStaging, setImportStaging] = useState<{ fileName: string; text: string; linhaCount: number } | null>(null);
  const [importingFornecedores, setImportingFornecedores] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importResultado, setImportResultado] = useState<ResultadoImportacaoFornecedoresCsv | null>(null);

  const debouncedBusca = useDebouncedValue(filters.busca, listaBuscaDebounceMs(filters.busca));
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: fornecedoresListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarFornecedores(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar fornecedores.');
      }
      return {
        items: result.data.items,
        total: result.data.total,
        fallbackReason: result.meta?.fallbackReason ?? '',
        listSource: result.meta?.source ?? 'local',
        staleWhileRevalidate: Boolean(result.meta?.staleWhileRevalidate),
      };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;
  const fallbackReason = listQuery.data?.fallbackReason ?? '';
  const listSource = listQuery.data?.listSource ?? 'local';
  const staleWhileRevalidate = Boolean(listQuery.data?.staleWhileRevalidate);

  useStaleWhileRevalidateListaRetry({
    staleWhileRevalidate,
    hasCloudConfig,
    queryClient,
    queryKeyPrefix: ['fornecedores', 'lista'],
    deps: [filtersForLista],
  });

  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Nao foi possivel carregar fornecedores.'
        : '';

  const invalidateFornecedoresLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['fornecedores'] });
  }, [queryClient]);

  const formInitialValue = useMemo<FornecedorFormData>(
    () =>
      selected
        ? {
            nome: selected.nome,
            cnpj: selected.cnpj,
            telefone: selected.telefone,
            email: selected.email,
            endereco: selected.endereco,
            ativo: selected.ativo,
          }
        : emptyForm,
    [selected],
  );

  async function submitFornecedor(data: FornecedorFormData) {
    if (!canAccessAction('fornecedores', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar fornecedores.' };
    }
    const validationError = validateFornecedor(data);
    if (validationError) return { success: false, error: validationError };
    const result = await salvarFornecedor(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateFornecedoresLista();
      setSuccess(result.meta?.source === 'local' ? 'Fornecedor salvo localmente.' : 'Fornecedor salvo com sucesso.');
    }
    return result;
  }

  async function handleToggleStatus(item: Fornecedor) {
    if (!canAccessAction('fornecedores', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar fornecedores.');
      return;
    }
    const result = await toggleFornecedorStatus(item.id, !item.ativo);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel atualizar fornecedor.');
      return;
    }
    await invalidateFornecedoresLista();
    setSuccess(result.meta?.source === 'local' ? 'Status do fornecedor atualizado localmente.' : 'Status do fornecedor atualizado com sucesso.');
  }

  function baixarModeloCsvImportacaoFornecedores() {
    if (!canAccessAction('fornecedores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar fornecedores.');
      return;
    }
    setError('');
    const { csv, fileName } = montarModeloCsvImportacaoFornecedores();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess('Modelo CSV de importacao baixado. Edite e use em Importar Excel (CSV).');
  }

  function openImportFornecedoresPicker() {
    if (!canAccessAction('fornecedores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar fornecedores.');
      return;
    }
    setError('');
    importInputRef.current?.click();
  }

  async function stageImportFornecedoresFromFile(file: File | null) {
    if (!file) return;
    if (!canAccessAction('fornecedores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar fornecedores.');
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

    const preview = previewImportacaoFornecedoresCsv(text);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportStaging({ fileName: file.name, text, linhaCount: preview.linhaCount });
  }

  function cancelImportFornecedoresStaging() {
    if (importingFornecedores) return;
    setImportStaging(null);
  }

  function closeImportFornecedoresResultado() {
    setImportResultado(null);
  }

  async function confirmImportFornecedoresStaging() {
    if (!importStaging) return;
    if (!canAccessAction('fornecedores', 'editar')) {
      setError('Seu perfil nao possui permissao para importar fornecedores.');
      return;
    }
    setError('');
    setSuccess('');
    setImportingFornecedores(true);
    setImportProgress('A gravar na nuvem…');
    const text = importStaging.text;

    try {
      const result = await Promise.race([
        importarFornecedoresDoArquivoCsv(text),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Tempo esgotado ao gravar na nuvem.')), 45_000);
        }),
      ]);

      if (!result.success) {
        const base = result.error ?? 'Importacao nao concluida.';
        setError(
          base.includes('Atualize a pagina')
            ? base
            : `${base} Atualize a pagina e confira o total antes de importar de novo.`,
        );
        return;
      }

      const r = result.data;
      if (!r) {
        setError('Resumo da importacao indisponivel.');
        return;
      }
      setImportResultado(r);
      void invalidateFornecedoresLista();
    } catch {
      setError('A importacao nao confirmou o fim. Atualize a pagina e confira o total antes de importar de novo.');
    } finally {
      setImportingFornecedores(false);
      setImportProgress('');
      setImportStaging(null);
    }
  }

  async function exportFornecedoresCsv() {
    if (!canAccessAction('fornecedores', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar fornecedores.');
      return;
    }
    setError('');
    const result = await montarExportacaoFornecedoresCsv();
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
    setSuccess('Exportacao Excel (CSV) — todos os fornecedores concluida.');
  }

  async function exportFornecedoresCsvFiltrado() {
    if (!canAccessAction('fornecedores', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar fornecedores.');
      return;
    }
    setError('');
    const result = await montarExportacaoFornecedoresCsv({ filtroLista: filtersForLista });
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
    listSource,
    staleWhileRevalidate,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load: invalidateFornecedoresLista,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('fornecedores', 'editar')) {
        setError('Seu perfil nao possui permissao para criar fornecedores.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: async (item: Fornecedor) => {
      if (!canAccessAction('fornecedores', 'editar')) {
        setError('Seu perfil nao possui permissao para editar fornecedores.');
        return;
      }
      const result = await buscarFornecedorPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o fornecedor.');
        return;
      }
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitFornecedor,
    handleToggleStatus,
    importInputRef,
    importStaging,
    importingFornecedores,
    importProgress,
    importResultado,
    openImportFornecedoresPicker,
    baixarModeloCsvImportacaoFornecedores,
    stageImportFornecedoresFromFile,
    cancelImportFornecedoresStaging,
    confirmImportFornecedoresStaging,
    closeImportFornecedoresResultado,
    exportFornecedoresCsv,
    exportFornecedoresCsvFiltrado,
  };
}
