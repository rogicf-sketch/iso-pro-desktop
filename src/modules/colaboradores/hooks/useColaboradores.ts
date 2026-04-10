import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function useColaboradores() {
  const { canAccessAction } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<ColaboradorFiltro>(initialFilters);
  const [items, setItems] = useState<Colaborador[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Colaborador | null>(null);
  const [importStaging, setImportStaging] = useState<{ fileName: string; text: string; linhaCount: number } | null>(null);
  const [importingColaboradores, setImportingColaboradores] = useState(false);
  const [importResultado, setImportResultado] = useState<ResultadoImportacaoColaboradoresCsv | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const result = await listarColaboradores(filters);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar colaboradores.');
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
      setSuccess(result.meta?.source === 'local' ? 'Colaborador salvo localmente.' : 'Colaborador salvo com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      await load();
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
    setSuccess(result.meta?.source === 'local' ? 'Status do colaborador atualizado localmente.' : 'Status do colaborador atualizado com sucesso.');
    await load();
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
    await load();
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
    const result = await montarExportacaoColaboradoresCsv({ filtroLista: filters });
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
