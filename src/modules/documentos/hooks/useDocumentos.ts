import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import { verifyCurrentUserPassword } from '../../auth/services/auth.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { validateDocumento } from '../schemas/documento.schema';
import {
  buscarDocumentoPorId,
  cancelarDocumento,
  excluirDocumentosDefinitivamente,
  importarDocumentosDoArquivoCsv,
  obterIdsDocumentosFiltrados,
  obterResumosDocumentosParaExclusao,
  listarDocumentos,
  montarExportacaoDocumentosCsvResumo,
  montarModeloCsvImportacaoDocumentos,
  previewImportacaoDocumentosCsv,
  salvarDocumento,
  sincronizarPlanejamentoLocalComNuvem,
  diagnosticarPlanejamentoLocalVersusNuvem,
} from '../services/documentos.service';
import type {
  Documento,
  DocumentoFiltro,
  DocumentoFormData,
  DocumentoListItem,
  DocumentosImportacaoResumo,
} from '../types/documento.types';

const initialFilters: DocumentoFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 6,
};

const emptyForm: DocumentoFormData = {
  numero: '',
  revisao: 'A',
  descricao: '',
  responsavel: '',
  dataDocumento: new Date().toISOString().slice(0, 10),
  observacao: '',
  itens: [],
};

export function useDocumentos() {
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<DocumentoFiltro>(initialFilters);
  const [items, setItems] = useState<DocumentoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [documentosSource, setDocumentosSource] = useState<'supabase' | 'local' | null>(null);
  const [syncingLocalParaNuvem, setSyncingLocalParaNuvem] = useState(false);
  const [planejamentoDiag, setPlanejamentoDiag] = useState<{ noNavegador: number; noSnapshot: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Documento | null>(null);
  const [viewDocument, setViewDocument] = useState<Documento | null>(null);
  const [importSnapshotConflict, setImportSnapshotConflict] = useState(false);
  const [importStaging, setImportStaging] = useState<{
    fileName: string;
    text: string;
    linhaCount: number;
  } | null>(null);
  const [importingDocumentos, setImportingDocumentos] = useState(false);
  const [importResultado, setImportResultado] = useState<DocumentosImportacaoResumo | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [cancelDocAlvo, setCancelDocAlvo] = useState<DocumentoListItem | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [idsParaExcluirDocumentos, setIdsParaExcluirDocumentos] = useState<string[]>([]);
  const [excluirModalResumos, setExcluirModalResumos] = useState<{ numero: string; revisao: string }[]>([]);
  const [excluirModalResumosLoading, setExcluirModalResumosLoading] = useState(false);
  const [excluirDefinitivoSenha, setExcluirDefinitivoSenha] = useState('');
  const [excluirDefinitivoBusy, setExcluirDefinitivoBusy] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const filterSelectionKey = `${filters.busca}\u0001${filters.status}\u0001${filters.pageSize}`;
  const [prevFilterSelectionKey, setPrevFilterSelectionKey] = useState(filterSelectionKey);
  if (filterSelectionKey !== prevFilterSelectionKey) {
    setPrevFilterSelectionKey(filterSelectionKey);
    setSelectedDocumentIds([]);
  }
  const [selectAllFilteredBusy, setSelectAllFilteredBusy] = useState(false);

  const selectedDocumentIdSet = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds]);
  const idsParaExcluirKey = idsParaExcluirDocumentos.slice().sort().join('\u0001');

  if (idsParaExcluirDocumentos.length === 0) {
    if (excluirModalResumos.length > 0) {
      setExcluirModalResumos([]);
    }
    if (excluirModalResumosLoading) {
      setExcluirModalResumosLoading(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
    const result = await listarDocumentos(filters);

    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar documentos.');
      setItems([]);
      setTotal(0);
      setFallbackReason('');
      setDocumentosSource(null);
      setPlanejamentoDiag(null);
    } else {
      setItems(result.data.items);
      setTotal(result.data.total);
      setFallbackReason(result.meta?.fallbackReason ?? '');
      setDocumentosSource(result.meta?.source === 'local' ? 'local' : result.meta?.source === 'supabase' ? 'supabase' : null);
      const diag = await diagnosticarPlanejamentoLocalVersusNuvem();
      setPlanejamentoDiag(diag);
    }

    setLoading(false);
  }, [filters]);

  const enviarPlanejamentoLocalParaNuvem = useCallback(async () => {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para sincronizar.');
      return;
    }
    const ok = window.confirm(
      'Isto substitui o planejamento na nuvem (iso_pro_snapshot) pela copia deste navegador. O app mobile passa a ver esses desenhos. Continuar?',
    );
    if (!ok) return;
    setError('');
    setSuccess('');
    setSyncingLocalParaNuvem(true);
    const result = await sincronizarPlanejamentoLocalComNuvem();
    setSyncingLocalParaNuvem(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Falha ao sincronizar.');
      return;
    }
    setSuccess(
      `Planejamento enviado para a nuvem (${result.data.total} documento(s)). Recarregue o mobile e toque em Carregar dados da nuvem.`,
    );
    await load();
  }, [canAccessAction, load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!idsParaExcluirDocumentos.length) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExcluirModalResumosLoading(true);
    });
    void obterResumosDocumentosParaExclusao(idsParaExcluirDocumentos).then((result) => {
      if (cancelled) return;
      setExcluirModalResumosLoading(false);
      if (result.success && result.data) {
        setExcluirModalResumos(result.data);
      } else {
        setExcluirModalResumos([]);
      }
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idsParaExcluirKey estabiliza idsParaExcluirDocumentos
  }, [idsParaExcluirKey]);

  const formInitialValue = useMemo<DocumentoFormData>(
    () =>
      selected
        ? {
            numero: selected.numero,
            revisao: selected.revisao,
            descricao: selected.descricao,
            responsavel: selected.responsavel,
            dataDocumento: selected.dataDocumento,
            observacao: selected.observacao,
            itens: selected.itens,
          }
        : emptyForm,
    [selected],
  );

  async function submitDocumento(data: DocumentoFormData) {
    if (!canAccessAction('documentos', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar documentos.' };
    }
    const validationError = validateDocumento(data);
    if (validationError) return { success: false, error: validationError };

    const result = await salvarDocumento(data, selected?.id);
    if (result.success) {
      setSuccess(result.meta?.source === 'local' ? 'Documento salvo localmente.' : 'Documento salvo com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      await load();
    }
    return result;
  }

  function fecharCancelamentoAdministrativo() {
    if (cancelSaving) return;
    setCancelDocAlvo(null);
    setCancelMotivo('');
    setCancelError('');
  }

  async function handleCancelar(item: DocumentoListItem) {
    if (!canAccessAction('documentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar documentos.');
      return;
    }
    if (item.status === 'cancelado') {
      setError('Este documento ja esta cancelado.');
      return;
    }
    setError('');
    if (item.status === 'pendente') {
      if (
        !window.confirm(
          `Confirma cancelar o documento ${item.numero} rev. ${item.revisao}? O planejamento deixa de ser usado neste fluxo; recebimentos e atendimentos ja lancados nao sao alterados.`,
        )
      ) {
        return;
      }
      setCancelSaving(true);
      const result = await cancelarDocumento(item.id, { actorLogin: user?.login });
      setCancelSaving(false);
      if (!result.success) {
        setError(result.error ?? 'Nao foi possivel cancelar documento.');
        return;
      }
      setSuccess(result.meta?.source === 'local' ? 'Documento cancelado localmente.' : 'Documento cancelado com sucesso.');
      await load();
      return;
    }

    setError('');
    setCancelError('');
    setCancelMotivo('');
    setIdsParaExcluirDocumentos([]);
    setExcluirDefinitivoSenha('');
    setCancelDocAlvo(item);
  }

  function toggleSelectDocumentoId(id: string) {
    setSelectedDocumentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectDocumentosPaginaAtual() {
    const pageIds = items.map((i) => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedDocumentIdSet.has(id));
    if (allSelected) {
      setSelectedDocumentIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedDocumentIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  }

  async function selectAllDocumentosFiltered() {
    if (!canAccessAction('documentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar documentos.');
      return;
    }
    setError('');
    setSelectAllFilteredBusy(true);
    const result = await obterIdsDocumentosFiltrados(filters);
    setSelectAllFilteredBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel selecionar todos os documentos do filtro.');
      return;
    }
    setSelectedDocumentIds(result.data);
  }

  function clearDocumentosSelection() {
    setSelectedDocumentIds([]);
  }

  function abrirExclusaoDefinitivaDocumento(item: DocumentoListItem) {
    if (!canAccessAction('documentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir documentos definitivamente.');
      return;
    }
    setError('');
    setCancelDocAlvo(null);
    setCancelMotivo('');
    setCancelError('');
    setExcluirDefinitivoSenha('');
    setIdsParaExcluirDocumentos([item.id]);
  }

  function abrirExclusaoDefinitivaEmMassa() {
    if (!canAccessAction('documentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir documentos definitivamente.');
      return;
    }
    if (!selectedDocumentIds.length) return;
    setError('');
    setCancelDocAlvo(null);
    setCancelMotivo('');
    setCancelError('');
    setExcluirDefinitivoSenha('');
    setIdsParaExcluirDocumentos(selectedDocumentIds);
  }

  function fecharExclusaoDefinitivaDocumento() {
    if (excluirDefinitivoBusy) return;
    setIdsParaExcluirDocumentos([]);
    setExcluirDefinitivoSenha('');
  }

  async function confirmarExclusaoDefinitivaDocumento() {
    if (!idsParaExcluirDocumentos.length) return;
    if (!canAccessAction('documentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir documentos definitivamente.');
      return;
    }
    setError('');
    setExcluirDefinitivoBusy(true);
    const senhaOk = await verifyCurrentUserPassword(excluirDefinitivoSenha);
    if (!senhaOk) {
      setError('Senha incorreta.');
      setExcluirDefinitivoBusy(false);
      return;
    }
    const ids = [...idsParaExcluirDocumentos];
    const result = await excluirDocumentosDefinitivamente(ids, { actorLogin: user?.login });
    setExcluirDefinitivoBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel excluir o(s) documento(s).');
      return;
    }
    const rem = result.data.removidos;
    setIdsParaExcluirDocumentos([]);
    setExcluirDefinitivoSenha('');
    setSelectedDocumentIds((prev) => prev.filter((id) => !ids.includes(id)));
    if (viewDocument && ids.includes(viewDocument.id)) {
      setViewDocument(null);
    }
    await load();
    setSuccess(
      result.meta?.source === 'local'
        ? `Exclusao definitiva: ${rem} documento(s) removido(s) (gravacao local).`
        : `Exclusao definitiva: ${rem} documento(s) removido(s) do planejamento.`,
    );
  }

  async function confirmarCancelamentoAdministrativo() {
    if (!cancelDocAlvo) return;
    const motivo = cancelMotivo.trim();
    if (motivo.length < 15) {
      setCancelError('Informe uma justificativa com pelo menos 15 caracteres.');
      return;
    }
    setCancelError('');
    setCancelSaving(true);
    const result = await cancelarDocumento(cancelDocAlvo.id, {
      motivoAdministrativo: motivo,
      actorLogin: user?.login,
    });
    setCancelSaving(false);
    if (!result.success) {
      setCancelError(result.error ?? 'Nao foi possivel cancelar documento.');
      return;
    }
    fecharCancelamentoAdministrativo();
    setSuccess(result.meta?.source === 'local' ? 'Documento cancelado localmente.' : 'Documento cancelado com sucesso.');
    await load();
  }

  function baixarBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportDocumentosCsvResumo() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar documentos.');
      return;
    }
    setError('');
    setImportSnapshotConflict(false);
    const result = await montarExportacaoDocumentosCsvResumo();
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar o CSV.');
      return;
    }
    baixarBlob(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }), result.data.fileName);
    setSuccess('Exportacao Excel - itens (todos) concluida.');
  }

  async function exportDocumentosCsvResumoFiltrado() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar documentos.');
      return;
    }
    setError('');
    setImportSnapshotConflict(false);
    const result = await montarExportacaoDocumentosCsvResumo({
      filtroLista: { busca: filters.busca, status: filters.status },
    });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar o CSV.');
      return;
    }
    baixarBlob(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }), result.data.fileName);
    setSuccess('Exportacao Excel - itens (filtro atual) concluida.');
  }

  function openImportDocumentosPicker() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar documentos.');
      return;
    }
    setError('');
    importInputRef.current?.click();
  }

  function downloadModeloCsvImportacaoDocumentos() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para baixar o modelo.');
      return;
    }
    setError('');
    const { csv, fileName } = montarModeloCsvImportacaoDocumentos();
    baixarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
    setSuccess('Modelo CSV de importacao baixado. Edite e use em Importar Excel (CSV).');
  }

  async function stageImportDocumentosFromFile(file: File | null) {
    if (!file) return;
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar documentos.');
      return;
    }
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
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

    const preview = previewImportacaoDocumentosCsv(text);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportStaging({ fileName: file.name, text, linhaCount: preview.linhaCount });
  }

  function cancelImportDocumentosStaging() {
    if (importingDocumentos) return;
    setImportStaging(null);
  }

  function closeImportDocumentosResultado() {
    setImportResultado(null);
  }

  async function confirmImportDocumentosStaging() {
    if (!importStaging) return;
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar documentos.');
      return;
    }
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
    setImportingDocumentos(true);
    const text = importStaging.text;

    const result = await importarDocumentosDoArquivoCsv(text);
    setImportingDocumentos(false);
    setImportStaging(null);

    if (!result.success) {
      setImportSnapshotConflict(isSnapshotConflictResult(result));
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

  async function reloadAfterImportSnapshotConflict() {
    setImportSnapshotConflict(false);
    await load();
  }

  return {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    documentosSource,
    syncingLocalParaNuvem,
    enviarPlanejamentoLocalParaNuvem,
    planejamentoDiag,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('documentos', 'editar')) {
        setError('Seu perfil nao possui permissao para criar documentos.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: async (item: DocumentoListItem) => {
      if (!canAccessAction('documentos', 'editar')) {
        setError('Seu perfil nao possui permissao para editar documentos.');
        return;
      }
      if (item.status === 'cancelado') {
        setError('Documentos cancelados nao podem ser editados.');
        return;
      }
      if (item.status !== 'pendente') {
        setError('Documentos com atendimento iniciado nao podem ser editados por este fluxo.');
        return;
      }
      const result = await buscarDocumentoPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o documento.');
        return;
      }
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    viewDocument,
    closeViewDocument: () => setViewDocument(null),
    openViewDocumento: async (item: DocumentoListItem) => {
      const result = await buscarDocumentoPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o documento.');
        return;
      }
      setError('');
      setViewDocument(result.data);
    },
    submitDocumento,
    handleCancelar,
    importInputRef,
    importSnapshotConflict,
    importStaging,
    importingDocumentos,
    importResultado,
    exportDocumentosCsvResumo,
    exportDocumentosCsvResumoFiltrado,
    openImportDocumentosPicker,
    downloadModeloCsvImportacaoDocumentos,
    stageImportDocumentosFromFile,
    cancelImportDocumentosStaging,
    confirmImportDocumentosStaging,
    closeImportDocumentosResultado,
    reloadAfterImportSnapshotConflict,
    cancelDocAlvo,
    cancelMotivo,
    setCancelMotivo,
    cancelSaving,
    fecharCancelamentoAdministrativo,
    confirmarCancelamentoAdministrativo,
    cancelError,
    idsParaExcluirDocumentos,
    excluirModalResumos,
    excluirModalResumosLoading,
    excluirDefinitivoSenha,
    setExcluirDefinitivoSenha,
    excluirDefinitivoBusy,
    abrirExclusaoDefinitivaDocumento,
    abrirExclusaoDefinitivaEmMassa,
    fecharExclusaoDefinitivaDocumento,
    confirmarExclusaoDefinitivaDocumento,
    selectedDocumentIds,
    selectedDocumentIdSet,
    toggleSelectDocumentoId,
    toggleSelectDocumentosPaginaAtual,
    selectAllDocumentosFiltered,
    selectAllFilteredBusy,
    clearDocumentosSelection,
  };
}
