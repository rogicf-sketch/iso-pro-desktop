import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig, shouldUseCloudMaterials } from '../../../lib/supabase';
import { verifyCurrentUserPassword } from '../../auth/services/auth.service';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  analisarUsoMateriaisPorIds,
  formatarUsoMateriaisResumoTexto,
  type UsoMaterialNosModulos,
} from '../services/materiaisReferencias.service';
import {
  buscarMaterialPorId,
  excluirMateriaisDefinitivamente,
  importarMateriaisDoArquivoCsv,
  listarDisciplinas,
  listarMateriais,
  listarUnidadesCadastro,
  montarModeloCsvImportacaoMateriais,
  montarExportacaoMateriaisCsv,
  obterCodigosMateriaisPorIds,
  obterIdsMateriaisFiltrados,
  previewImportacaoMateriaisCsv,
  salvarMaterial,
  toggleMaterialStatus,
  type MateriaisImportacaoResumo,
} from '../services/materiais.service';
import { validateMaterial } from '../schemas/material.schema';
import type { Material, MaterialFiltro, MaterialFormData, MaterialListItem } from '../types/material.types';
import {
  loadPersistedMateriaisImportStaging,
  persistMateriaisImportStaging,
} from '../utils/materiaisImportStagingStorage';

const initialFilters: MaterialFiltro = {
  busca: '',
  disciplina: '',
  ativo: 'todos',
  page: 1,
  pageSize: 8,
};

const emptyForm: MaterialFormData = {
  codigo: '',
  codigoBarras: '',
  descricao: '',
  diametro: '',
  disciplina: '',
  unidade: 'UN',
  peso: 0,
  estoqueMinimo: 0,
  ativo: true,
  observacao: '',
};

export function useMateriais() {
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const cloudMaterialsEnabled = shouldUseCloudMaterials();
  const [filters, setFilters] = useState<MaterialFiltro>(initialFilters);
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Material | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importStaging, setImportStaging] = useState<{
    fileName: string;
    text: string;
    linhaCount: number;
  } | null>(() => loadPersistedMateriaisImportStaging());
  const [importingMateriais, setImportingMateriais] = useState(false);
  const [importResultado, setImportResultado] = useState<MateriaisImportacaoResumo | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const filterSelectionKey = `${filters.busca}\u0001${filters.disciplina}\u0001${filters.ativo}\u0001${filters.pageSize}`;
  const [prevFilterSelectionKey, setPrevFilterSelectionKey] = useState(filterSelectionKey);
  if (filterSelectionKey !== prevFilterSelectionKey) {
    setPrevFilterSelectionKey(filterSelectionKey);
    setSelectedMaterialIds([]);
  }
  const [deleteDefinitivoOpen, setDeleteDefinitivoOpen] = useState(false);
  const [deleteDefinitivoSenha, setDeleteDefinitivoSenha] = useState('');
  const [deleteDefinitivoBusy, setDeleteDefinitivoBusy] = useState(false);
  const [selectAllFilteredBusy, setSelectAllFilteredBusy] = useState(false);
  const [deleteModalCodigos, setDeleteModalCodigos] = useState<string[]>([]);
  const [deleteModalCodigosLoading, setDeleteModalCodigosLoading] = useState(false);
  const [deleteUsoMateriais, setDeleteUsoMateriais] = useState<UsoMaterialNosModulos[]>([]);
  const [deleteUsoLoading, setDeleteUsoLoading] = useState(false);
  /** Nuvem: null = analise pendente; true = OK; false = falha ao analisar. */
  const [deleteUsoAnaliseOk, setDeleteUsoAnaliseOk] = useState<boolean | null>(null);
  /** Erros da confirmacao (visiveis dentro do modal). */
  const [deleteExclusaoError, setDeleteExclusaoError] = useState('');

  const selectedMaterialIdSet = useMemo(() => new Set(selectedMaterialIds), [selectedMaterialIds]);
  const selectedMaterialIdsKey = selectedMaterialIds.slice().sort().join('\u0001');

  if (!deleteDefinitivoOpen || !selectedMaterialIds.length) {
    if (deleteModalCodigos.length > 0) {
      setDeleteModalCodigos([]);
    }
    if (deleteModalCodigosLoading) {
      setDeleteModalCodigosLoading(false);
    }
    if (deleteUsoMateriais.length > 0) {
      setDeleteUsoMateriais([]);
    }
    if (deleteUsoLoading) {
      setDeleteUsoLoading(false);
    }
    if (deleteUsoAnaliseOk !== null) {
      setDeleteUsoAnaliseOk(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    const [result, disciplinasResult, unidadesResult] = await Promise.all([
      listarMateriais(filters),
      listarDisciplinas(),
      listarUnidadesCadastro(),
    ]);

    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar materiais.');
      setItems([]);
      setTotal(0);
    } else {
      setItems(result.data.items);
      setTotal(result.data.total);
    }

    setDisciplinas(disciplinasResult);
    setUnidades(unidadesResult);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    persistMateriaisImportStaging(importStaging);
  }, [importStaging]);

  useEffect(() => {
    if (!deleteDefinitivoOpen || !selectedMaterialIds.length) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDeleteModalCodigosLoading(true);
      setDeleteUsoLoading(true);
      setDeleteUsoAnaliseOk(null);
    });
    void Promise.all([
      obterCodigosMateriaisPorIds(selectedMaterialIds),
      analisarUsoMateriaisPorIds(selectedMaterialIds),
    ]).then(([codigosResult, usoResult]) => {
      if (cancelled) return;
      setDeleteModalCodigosLoading(false);
      setDeleteUsoLoading(false);
      setDeleteUsoAnaliseOk(usoResult.success);
      if (codigosResult.success && codigosResult.data) {
        setDeleteModalCodigos(codigosResult.data);
      } else {
        setDeleteModalCodigos([]);
      }
      if (usoResult.success && usoResult.data) {
        setDeleteUsoMateriais(usoResult.data);
      } else {
        setDeleteUsoMateriais([]);
      }
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedMaterialIdsKey estabiliza selectedMaterialIds
  }, [deleteDefinitivoOpen, selectedMaterialIdsKey]);

  const formInitialValue = useMemo<MaterialFormData>(
    () =>
      selected
        ? {
            codigo: selected.codigo,
            codigoBarras: selected.codigoBarras ?? '',
            descricao: selected.descricao,
            diametro: selected.diametro,
            disciplina: selected.disciplina,
            unidade: selected.unidade,
            peso: selected.peso,
            estoqueMinimo: selected.estoqueMinimo,
            ativo: selected.ativo,
            observacao: selected.observacao,
          }
        : emptyForm,
    [selected],
  );

  async function submitMaterial(data: MaterialFormData) {
    if (!canAccessAction('materiais', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar materiais.' };
    }
    const validationError = validateMaterial(data);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const result = await salvarMaterial(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await load();
      setSuccess('Material salvo com sucesso.');
    }

    return result;
  }

  async function handleToggleStatus(item: MaterialListItem) {
    if (!canAccessAction('materiais', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar materiais.');
      return;
    }
    await toggleMaterialStatus(item.id, !item.ativo);
    await load();
  }

  function toggleSelectMaterialId(id: string) {
    setSelectedMaterialIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectMateriaisPaginaAtual() {
    const pageIds = items.map((i) => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedMaterialIdSet.has(id));
    if (allSelected) {
      setSelectedMaterialIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedMaterialIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  }

  async function selectAllMateriaisFiltered() {
    if (!canAccessAction('materiais', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar materiais.');
      return;
    }
    setError('');
    setSelectAllFilteredBusy(true);
    const result = await obterIdsMateriaisFiltrados(filters);
    setSelectAllFilteredBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel selecionar todos os materiais do filtro.');
      return;
    }
    setSelectedMaterialIds(result.data);
  }

  function clearMateriaisSelection() {
    setSelectedMaterialIds([]);
  }

  function openDeleteDefinitivoModal() {
    if (!canAccessAction('materiais', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir materiais definitivamente.');
      return;
    }
    if (!selectedMaterialIds.length) return;
    setError('');
    setDeleteExclusaoError('');
    setDeleteDefinitivoSenha('');
    setDeleteUsoAnaliseOk(null);
    setDeleteDefinitivoOpen(true);
  }

  function closeDeleteDefinitivoModal() {
    if (deleteDefinitivoBusy) return;
    setDeleteDefinitivoOpen(false);
    setDeleteDefinitivoSenha('');
    setDeleteExclusaoError('');
  }

  async function confirmDeleteMateriaisDefinitivo() {
    if (!canAccessAction('materiais', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir materiais definitivamente.');
      return;
    }
    if (!selectedMaterialIds.length) return;
    setError('');
    setDeleteExclusaoError('');

    if (cloudMaterialsEnabled) {
      if (deleteUsoLoading || deleteUsoAnaliseOk === null) {
        setDeleteExclusaoError('Aguarde a analise de uso terminar antes de confirmar a exclusao na nuvem.');
        return;
      }
      if (deleteUsoAnaliseOk === false) {
        setDeleteExclusaoError(
          'Nao foi possivel verificar referencias. Feche e abra esta janela para tentar de novo.',
        );
        return;
      }
      const comUso = deleteUsoMateriais.some((u) => u.recebimentos || u.documentos || u.atendimento);
      if (comUso) {
        setDeleteExclusaoError(
          `Nuvem: exclusao bloqueada — o codigo consta em outros modulos.\n\n${formatarUsoMateriaisResumoTexto(deleteUsoMateriais)}`,
        );
        return;
      }
    }

    setDeleteDefinitivoBusy(true);
    const senhaOk = await verifyCurrentUserPassword(deleteDefinitivoSenha);
    if (!senhaOk) {
      setDeleteExclusaoError('Senha incorreta.');
      setDeleteDefinitivoBusy(false);
      return;
    }
    const result = await excluirMateriaisDefinitivamente(selectedMaterialIds);
    setDeleteDefinitivoBusy(false);
    if (!result.success || !result.data) {
      let msg = result.error ?? 'Nao foi possivel excluir os materiais.';
      const base = msg.toLowerCase();
      if (base.includes('referenciados') || base.includes('foreign key')) {
        const uso = await analisarUsoMateriaisPorIds(selectedMaterialIds);
        if (uso.success && uso.data) {
          const extra = formatarUsoMateriaisResumoTexto(uso.data);
          if (extra) {
            msg = `${msg}\n\n${extra}`;
          }
        }
      }
      setDeleteExclusaoError(msg);
      return;
    }
    setDeleteDefinitivoOpen(false);
    setDeleteDefinitivoSenha('');
    setSelectedMaterialIds([]);
    await load();
    setSuccess(`Exclusao definitiva: ${result.data.removidos} material(is) removido(s).`);
  }

  function baixarBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportMateriaisCsv() {
    if (!canAccessAction('materiais', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar materiais.');
      return;
    }
    setError('');
    const result = await montarExportacaoMateriaisCsv();
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar a planilha.');
      return;
    }
    baixarBlob(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }), result.data.fileName);
    setSuccess('Exportacao Excel (CSV) - todos os materiais concluida.');
  }

  async function exportMateriaisCsvFiltrado() {
    if (!canAccessAction('materiais', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar materiais.');
      return;
    }
    setError('');
    const result = await montarExportacaoMateriaisCsv({ filtroLista: filters });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar a planilha.');
      return;
    }
    baixarBlob(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }), result.data.fileName);
    setSuccess('Exportacao Excel (CSV) - filtro atual da lista concluida.');
  }

  function openImportMateriaisPicker() {
    if (!canAccessAction('materiais', 'editar')) {
      setError('Seu perfil nao possui permissao para importar materiais.');
      return;
    }
    setError('');
    importInputRef.current?.click();
  }

  function downloadModeloCsvImportacaoMateriais() {
    if (!canAccessAction('materiais', 'editar')) {
      setError('Seu perfil nao possui permissao para baixar o modelo.');
      return;
    }
    setError('');
    const { csv, fileName } = montarModeloCsvImportacaoMateriais();
    baixarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
    setSuccess('Modelo CSV de importacao baixado. Edite e use em Importar Excel (CSV).');
  }

  async function stageImportMateriaisFromFile(file: File | null) {
    if (!file) return;
    if (!canAccessAction('materiais', 'editar')) {
      setError('Seu perfil nao possui permissao para importar materiais.');
      return;
    }
    setError('');
    setSuccess('');
    setImportResultado(null);

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && file.type !== 'text/csv' && !lower.endsWith('.txt')) {
      setError('Selecione um arquivo CSV (exportado do Excel ou deste modulo).');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('Nao foi possivel ler o arquivo selecionado.');
      return;
    }

    const preview = previewImportacaoMateriaisCsv(text);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportStaging({ fileName: file.name, text, linhaCount: preview.linhaCount });
  }

  function cancelImportMateriaisStaging() {
    if (importingMateriais) return;
    setImportStaging(null);
  }

  function closeImportMateriaisResultado() {
    setImportResultado(null);
  }

  async function confirmImportMateriaisStaging() {
    if (!importStaging) return;
    if (!canAccessAction('materiais', 'editar')) {
      setError('Seu perfil nao possui permissao para importar materiais.');
      return;
    }
    setError('');
    setSuccess('');
    setImportingMateriais(true);
    const text = importStaging.text;

    const result = await importarMateriaisDoArquivoCsv(text, { actorLogin: user?.login });
    setImportingMateriais(false);
    setImportStaging(null);

    if (!result.success) {
      if (result.data?.detalhes.length) {
        setError(`${result.error ?? 'Importacao nao concluida.'} Detalhes: ${result.data.detalhes.join(' | ')}`);
      } else {
        setError(result.error ?? 'Importacao nao concluida.');
      }
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

  return {
    items,
    total,
    loading,
    error,
    success,
    hasCloudConfig,
    cloudMaterialsEnabled,
    filters,
    disciplinas,
    unidades,
    formInitialValue,
    isModalOpen,
    selected,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('materiais', 'editar')) {
        setError('Seu perfil nao possui permissao para criar materiais.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: async (item: MaterialListItem) => {
      if (!canAccessAction('materiais', 'editar')) {
        setError('Seu perfil nao possui permissao para editar materiais.');
        return;
      }
      const result = await buscarMaterialPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o material.');
        return;
      }
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitMaterial,
    handleToggleStatus,
    load,
    refresh: load,
    importInputRef,
    openImportMateriaisPicker,
    downloadModeloCsvImportacaoMateriais,
    importStaging,
    importingMateriais,
    importResultado,
    stageImportMateriaisFromFile,
    cancelImportMateriaisStaging,
    confirmImportMateriaisStaging,
    closeImportMateriaisResultado,
    exportMateriaisCsv,
    exportMateriaisCsvFiltrado,
    selectedMaterialIds,
    selectedMaterialIdSet,
    toggleSelectMaterialId,
    toggleSelectMateriaisPaginaAtual,
    selectAllMateriaisFiltered,
    selectAllFilteredBusy,
    clearMateriaisSelection,
    openDeleteDefinitivoModal,
    closeDeleteDefinitivoModal,
    confirmDeleteMateriaisDefinitivo,
    deleteDefinitivoOpen,
    deleteDefinitivoSenha,
    setDeleteDefinitivoSenha,
    deleteDefinitivoBusy,
    deleteModalCodigos,
    deleteModalCodigosLoading,
    deleteUsoMateriais,
    deleteUsoLoading,
    deleteUsoAnaliseOk,
    deleteExclusaoError,
  };
}
