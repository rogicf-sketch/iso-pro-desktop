import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function useFornecedores() {
  const { canAccessAction } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<FornecedorFiltro>(initialFilters);
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Fornecedor | null>(null);
  const [importStaging, setImportStaging] = useState<{ fileName: string; text: string; linhaCount: number } | null>(null);
  const [importingFornecedores, setImportingFornecedores] = useState(false);
  const [importResultado, setImportResultado] = useState<ResultadoImportacaoFornecedoresCsv | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const result = await listarFornecedores(filters);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar fornecedores.');
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
      setSuccess(result.meta?.source === 'local' ? 'Fornecedor salvo localmente.' : 'Fornecedor salvo com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      await load();
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
    setSuccess(result.meta?.source === 'local' ? 'Status do fornecedor atualizado localmente.' : 'Status do fornecedor atualizado com sucesso.');
    await load();
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
    const text = importStaging.text;

    const result = await importarFornecedoresDoArquivoCsv(text);
    setImportingFornecedores(false);
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
    await load();
    setImportResultado(r);
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
    const result = await montarExportacaoFornecedoresCsv({ filtroLista: filters });
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
