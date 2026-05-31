import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { isErroIntegridadePlanejamentoRefsAtendimento } from '../../../lib/snapshotDocumentosPlanejamentoIntegrity';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import { verifyCurrentUserPassword } from '../../auth/services/auth.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { validarCodigosMateriaisAtivosNoCadastroParaRecebimento } from '../../materiais/services/materiais.service';
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

function documentosListaQueryKey(filters: DocumentoFiltro, userLogin: string | undefined) {
  return ['documentos', 'lista', userLogin ?? '', filters] as const;
}

export function useDocumentos() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<DocumentoFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncingLocalParaNuvem, setSyncingLocalParaNuvem] = useState(false);
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
  const [importHistoricoBloqueio, setImportHistoricoBloqueio] = useState<{
    staging: { fileName: string; text: string; linhaCount: number };
    resumo?: DocumentosImportacaoResumo;
    error: string;
  } | null>(null);
  const [importSubstituirPasso, setImportSubstituirPasso] = useState<1 | 2>(1);
  const [importSubstituirSenha, setImportSubstituirSenha] = useState('');
  const [importSubstituirBusy, setImportSubstituirBusy] = useState(false);
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

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: documentosListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarDocumentos(filtersForLista);

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar documentos.');
      }

      const diag = await diagnosticarPlanejamentoLocalVersusNuvem();
      const documentosSource =
        result.meta?.source === 'local' ? 'local' : result.meta?.source === 'supabase' ? 'supabase' : null;
      const planejamentoMaisNoLocal =
        hasCloudConfig &&
        documentosSource === 'supabase' &&
        !result.meta?.fallbackReason &&
        diag.noSnapshot >= 0 &&
        diag.noNavegador > diag.noSnapshot;

      return {
        items: result.data.items,
        total: result.data.total,
        fallbackReason: result.meta?.fallbackReason ?? '',
        documentosSource,
        planejamentoDiag: diag,
        planejamentoMaisNoLocal,
      };
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const loading = listQuery.isLoading;
  const fallbackReason = listQuery.data?.fallbackReason ?? '';
  const documentosSource = listQuery.data?.documentosSource ?? null;
  const planejamentoDiag = listQuery.data?.planejamentoDiag ?? null;
  const planejamentoMaisNoLocal = listQuery.data?.planejamentoMaisNoLocal ?? false;
  const listError =
    listQuery.isError && listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.isError
        ? 'Nao foi possivel carregar documentos.'
        : '';

  const invalidateDocumentosLista = useCallback(async () => {
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
    await queryClient.invalidateQueries({ queryKey: ['documentos'] });
  }, [queryClient]);

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
    await invalidateDocumentosLista();
    setSuccess(
      `Planejamento enviado e verificado na nuvem: ${result.data.confirmadoNaNuvem} documento(s) confirmados no snapshot (igual ao enviado). Recarregue o mobile e toque em Carregar dados da nuvem.`,
    );
  }, [canAccessAction, invalidateDocumentosLista]);

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

    const erroMateriais = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
      data.itens.map((it) => it.codigoMaterial),
      'salvar',
      'documento',
    );
    if (erroMateriais) {
      return { success: false, error: erroMateriais };
    }

    const result = await salvarDocumento(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateDocumentosLista();
      setSuccess(result.meta?.source === 'local' ? 'Documento salvo localmente.' : 'Documento salvo com sucesso.');
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
      await invalidateDocumentosLista();
      setSuccess(result.meta?.source === 'local' ? 'Documento cancelado localmente.' : 'Documento cancelado com sucesso.');
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
    const result = await obterIdsDocumentosFiltrados(filtersForLista);
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
    await invalidateDocumentosLista();
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
    await invalidateDocumentosLista();
    setSuccess(result.meta?.source === 'local' ? 'Documento cancelado localmente.' : 'Documento cancelado com sucesso.');
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
      filtroLista: { busca: filtersForLista.busca, status: filtersForLista.status },
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

    const preview = await previewImportacaoDocumentosCsv(text);
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
    const stagingAtual = importStaging;
    const text = stagingAtual.text;

    const result = await importarDocumentosDoArquivoCsv(text);
    setImportingDocumentos(false);
    setImportStaging(null);

    if (!result.success) {
      setImportSnapshotConflict(isSnapshotConflictResult(result));
      if (isErroIntegridadePlanejamentoRefsAtendimento(result.error ?? '')) {
        if (canAccessAction('documentos', 'administrar')) {
          setImportHistoricoBloqueio({
            staging: stagingAtual,
            resumo: result.data,
            error: result.error ?? 'Importacao bloqueada por historico de atendimento incompatible.',
          });
          setImportSubstituirPasso(1);
          setImportSubstituirSenha('');
        } else {
          setError(
            `${result.error ?? 'Importacao bloqueada.'} Contacte um administrador para substituir o planejamento ou limpar o historico.`,
          );
        }
        return;
      }
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
    await invalidateDocumentosLista();
    setImportResultado(r);
  }

  function fecharImportHistoricoBloqueio() {
    if (importSubstituirBusy) return;
    setImportHistoricoBloqueio(null);
    setImportSubstituirPasso(1);
    setImportSubstituirSenha('');
  }

  function avancarImportSubstituirComLimpeza() {
    setImportSubstituirPasso(2);
    setImportSubstituirSenha('');
  }

  function voltarImportSubstituirComLimpeza() {
    setImportSubstituirPasso(1);
    setImportSubstituirSenha('');
  }

  async function confirmarImportSubstituirComLimpezaHistorico() {
    if (!importHistoricoBloqueio) return;
    if (!canAccessAction('documentos', 'administrar')) {
      setError('Substituir planejamento e limpar historico exige perfil administrador.');
      return;
    }
    const senhaOk = await verifyCurrentUserPassword(importSubstituirSenha);
    if (!senhaOk) {
      setError('Senha incorreta.');
      return;
    }

    setError('');
    setSuccess('');
    setImportSubstituirBusy(true);
    const result = await importarDocumentosDoArquivoCsv(importHistoricoBloqueio.staging.text, {
      substituirELimparHistoricoIncompativel: true,
      actorLogin: user?.login,
    });
    setImportSubstituirBusy(false);

    if (!result.success) {
      setImportSnapshotConflict(isSnapshotConflictResult(result));
      setError(result.error ?? 'Importacao nao concluida apos limpeza de historico.');
      return;
    }

    const r = result.data;
    if (!r) {
      setError('Resumo da importacao indisponivel.');
      return;
    }

    setImportHistoricoBloqueio(null);
    setImportSubstituirPasso(1);
    setImportSubstituirSenha('');
    await invalidateDocumentosLista();
    setImportResultado(r);
    setSuccess('Planejamento importado. Historico de atendimento incompatible foi removido da nuvem.');
  }

  async function reloadAfterImportSnapshotConflict() {
    setImportSnapshotConflict(false);
    await invalidateDocumentosLista();
  }

  return {
    items,
    total,
    loading,
    error: error || listError,
    success,
    fallbackReason,
    documentosSource,
    syncingLocalParaNuvem,
    enviarPlanejamentoLocalParaNuvem,
    planejamentoDiag,
    planejamentoMaisNoLocal,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load: invalidateDocumentosLista,
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
    importHistoricoBloqueio,
    importSubstituirPasso,
    importSubstituirSenha,
    setImportSubstituirSenha,
    importSubstituirBusy,
    fecharImportHistoricoBloqueio,
    avancarImportSubstituirComLimpeza,
    voltarImportSubstituirComLimpeza,
    confirmarImportSubstituirComLimpezaHistorico,
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
