import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useStaleWhileRevalidateListaRetry } from '../../../hooks/useStaleWhileRevalidateListaRetry';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialogProvider';
import { listaBuscaDebounceMs } from '../../../lib/listaBuscaDebounce';
import { invalidateDocumentosListaCabIndex } from '../../../lib/documentosPlanejamentoTabelas';
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
  carregarDocumentoPlanejamentoParaVisualizacao,
  carregarLocalizacoesPlanejamentoVisualizacao,
  carregarMetricasPlanejamentoVisualizacao,
  carregarSoMetricasPlanejamentoVisualizacao,
  peekMetricasPlanejamentoMemoria,
  fundirMetricasPlanejamento,
  metricasSementeDoDocumento,
  documentoComStatusDasLinhas,
  excluirDocumentosDefinitivamente,
  importarDocumentosDoArquivoCsv,
  atualizarDescricoesDocumentosDoArquivoCsv,
  extrairDescricoesDocumentosDoCsv,
  obterIdsDocumentosFiltrados,
  obterResumosDocumentosParaExclusao,
  listarDocumentos,
  montarExportacaoDocumentosCsvResumo,
  montarModeloCsvImportacaoDocumentos,
  carregarRevisoesAntigasActivasDoCsvImportacao,
  previewImportacaoDocumentosComRevisoesAntigas,
  previewRevisoesActivasOutrasAoSalvar,
  salvarDocumento,
  sincronizarPlanejamentoLocalComNuvem,
  diagnosticarPlanejamentoLocalVersusNuvem,
  visualizarPlanejamentoCampoPorId,
} from '../services/documentos.service';
import type { MetricasPorCodigoMaterial } from '../services/documentoPlanejamento';
import type { RevisaoActivaOutra } from '../utils/documentoRevisoesAntigas';
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
  pageSize: 20,
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

const DIAG_VAZIO = {
  noNavegador: 0,
  noSnapshot: -1,
  comItensNoLocal: 0,
  totalItensNoLocal: 0,
  comItensNaNuvem: -1,
  totalItensNaNuvem: -1,
  nuvemSemLinhasMaterial: false,
};

/** Diagnóstico local×nuvem: não bloquear a lista; refrescar no máximo a cada 5 min. */
const DIAG_STALE_MS = 5 * 60_000;
/** Páginas já vistas (ex. 299→293) saem da memória — troca instantânea. */
const LISTA_STALE_MS = 90_000;
const LISTA_GC_MS = 15 * 60_000;

function documentosListaQueryKey(filters: DocumentoFiltro, userLogin: string | undefined) {
  return ['documentos', 'lista', userLogin ?? '', filters] as const;
}

type DocumentosListaQueryData = {
  items: DocumentoListItem[];
  total: number;
  fallbackReason: string;
  documentosSource: 'local' | 'supabase' | null;
  staleWhileRevalidate: boolean;
  /** Página real dos items (para repor o UI se o salto falhar). */
  page?: number;
};

async function fetchDocumentosListaPage(
  filtersForLista: DocumentoFiltro,
  signal?: AbortSignal,
): Promise<DocumentosListaQueryData> {
  try {
    const result = await listarDocumentos(filtersForLista, { signal });
    if (!result.success || !result.data) {
      const msg = result.error ?? 'Nao foi possivel carregar documentos.';
      if (msg === 'AbortError' || signal?.aborted) {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        throw err;
      }
      throw new Error(msg);
    }
    const documentosSource =
      result.meta?.source === 'local' ? 'local' : result.meta?.source === 'supabase' ? 'supabase' : null;
    return {
      items: result.data.items,
      total: result.data.total,
      fallbackReason: result.meta?.fallbackReason ?? '',
      documentosSource,
      staleWhileRevalidate: Boolean(result.meta?.staleWhileRevalidate),
      page: result.data.page,
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    if (signal?.aborted) {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      throw err;
    }
    throw e;
  }
}

function documentosDiagQueryKey(userLogin: string | undefined) {
  return ['documentos', 'diag', userLogin ?? ''] as const;
}

function avisoSeImportacaoNaoFechou(mensagem: string): string {
  if (mensagem.includes('Atualize a pagina')) return mensagem;
  return `${mensagem} Atualize a pagina e confira o total antes de importar de novo.`;
}

export function useDocumentos() {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmDialog();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<DocumentoFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncingLocalParaNuvem, setSyncingLocalParaNuvem] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Documento | null>(null);
  const [viewDocument, setViewDocument] = useState<Documento | null>(null);
  const [viewDocumentLoading, setViewDocumentLoading] = useState(false);
  const [viewDocumentOpeningId, setViewDocumentOpeningId] = useState<string | null>(null);
  const [viewPlanejamentoMetricas, setViewPlanejamentoMetricas] = useState<Map<string, MetricasPorCodigoMaterial>>(
    new Map(),
  );
  const [viewPlanejamentoLocalizacoes, setViewPlanejamentoLocalizacoes] = useState<Map<string, string>>(new Map());
  const [viewPlanejamentoMetricasAviso, setViewPlanejamentoMetricasAviso] = useState<string | null>(null);
  /** True enquanto estoque/status das linhas ainda esta a carregar (mostra «…», nao Pendente falso). */
  const [viewPlanejamentoMetricasPending, setViewPlanejamentoMetricasPending] = useState(false);
  const viewDocumentoSeqRef = useRef(0);
  const [visualizarPlanejamentoBusyId, setVisualizarPlanejamentoBusyId] = useState<string | null>(null);
  const [importSnapshotConflict, setImportSnapshotConflict] = useState(false);
  const [importStaging, setImportStaging] = useState<{
    fileName: string;
    text: string;
    linhaCount: number;
    modo: 'full' | 'descricoes';
    revisoesAntigasActivas?: RevisaoActivaOutra[];
    cancelarRevisoesAntigas?: boolean;
  } | null>(null);
  const [importingDocumentos, setImportingDocumentos] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [lendoArquivoImportacao, setLendoArquivoImportacao] = useState(false);
  const importPreviewSeqRef = useRef(0);
  const [exportingDocumentosCsv, setExportingDocumentosCsv] = useState<'tudo' | 'filtro' | null>(null);
  const [importResultado, setImportResultado] = useState<DocumentosImportacaoResumo | null>(null);
  const [salvarRevisoesStaging, setSalvarRevisoesStaging] = useState<{
    data: DocumentoFormData;
    currentId?: string;
    revisoesAntigasActivas: RevisaoActivaOutra[];
  } | null>(null);
  const [salvarRevisoesBusy, setSalvarRevisoesBusy] = useState(false);
  const [importHistoricoBloqueio, setImportHistoricoBloqueio] = useState<{
    staging: {
      fileName: string;
      text: string;
      linhaCount: number;
      cancelarRevisoesAntigas?: boolean;
    };
    resumo?: DocumentosImportacaoResumo;
    error: string;
  } | null>(null);
  const [importSubstituirPasso, setImportSubstituirPasso] = useState<1 | 2>(1);
  const [importSubstituirSenha, setImportSubstituirSenha] = useState('');
  const [importSubstituirBusy, setImportSubstituirBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importModoRef = useRef<'full' | 'descricoes'>('full');
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

  const debouncedBusca = useDebouncedValue(filters.busca, listaBuscaDebounceMs(filters.busca));
  // Com índice local a página é síncrona; debounce mínimo só para ›/‹ em rajada.
  const debouncedPage = useDebouncedValue(filters.page, 40);
  const filtersForLista = useMemo(
    () => ({ ...filters, busca: debouncedBusca, page: debouncedPage }),
    [filters, debouncedBusca, debouncedPage],
  );

  // Bundle completo (snapshot + recebimentos) só sob demanda em «Visualizar» —
  // pré-carregar no mount com 4k+ desenhos deixava a lista em "Carregando..." sem fim.

  const listQuery = useQuery({
    queryKey: documentosListaQueryKey(filtersForLista, user?.login),
    queryFn: ({ signal }) => fetchDocumentosListaPage(filtersForLista, signal),
    placeholderData: keepPreviousData,
    staleTime: LISTA_STALE_MS,
    gcTime: LISTA_GC_MS,
    // Sem retry: 1 falha + retry duplicava 6s+4s e parecia «40s a actualizar».
    retry: false,
  });

  // Contagem exacta de dezenas de milhares de linhas em paralelo com a lista
  // disputava a sessão e deixava "Carregando documentos..." sem fim.
  const diagQuery = useQuery({
    queryKey: documentosDiagQueryKey(user?.login),
    enabled: hasCloudConfig && listQuery.isSuccess,
    staleTime: DIAG_STALE_MS,
    queryFn: () => diagnosticarPlanejamentoLocalVersusNuvem(),
  });

  /** Última lista boa — em timeout/erro a grelha NUNCA zera (evita «0 documentos · local»). */
  const lastGoodListRef = useRef<DocumentosListaQueryData | null>(null);
  if (listQuery.isSuccess && listQuery.data && listQuery.data.items.length > 0) {
    lastGoodListRef.current = {
      ...listQuery.data,
      page: listQuery.data.page ?? filtersForLista.page,
    };
  }
  const listView = listQuery.data?.items?.length
    ? listQuery.data
    : listQuery.isError || listQuery.isPlaceholderData
      ? lastGoodListRef.current
      : listQuery.data;
  const items = listView?.items ?? [];
  const total = listView?.total ?? 0;
  const loading = listQuery.isLoading && items.length === 0;
  const listShowingPlaceholder = listQuery.isPlaceholderData === true;
  const listFetching = listQuery.isFetching && listShowingPlaceholder && items.length > 0;
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    // Só avisar na troca de página lenta — nunca em prefetch/refetch de fundo.
    if (!listFetching) {
      setRefreshing(false);
      return;
    }
    const timer = window.setTimeout(() => setRefreshing(true), 1_200);
    return () => window.clearTimeout(timer);
  }, [listFetching]);

  // NÃO repor filters.page para lastGood — isso prendia o UI na página 1
  // (cada clique em 2/3… falhava ou competia e o efeito puxava de volta).

  const prefetchDocumentosPage = useCallback(
    (page: number) => {
      if (!Number.isFinite(page) || page < 1) return;
      const nextFilters = { ...filtersForLista, page };
      void queryClient.prefetchQuery({
        queryKey: documentosListaQueryKey(nextFilters, user?.login),
        queryFn: ({ signal }) => fetchDocumentosListaPage(nextFilters, signal),
        staleTime: LISTA_STALE_MS,
        gcTime: LISTA_GC_MS,
      });
    },
    [filtersForLista, queryClient, user?.login],
  );

  // Prefetch automático da seguinte desligado: competia com a página actual
  // (40s+ em «A actualizar…»). O rato em › / números ainda aquece via onPagePrefetch.

  const fallbackReason = listView?.fallbackReason ?? '';
  const documentosSource = listView?.documentosSource ?? lastGoodListRef.current?.documentosSource ?? null;
  const staleWhileRevalidate = Boolean(listView?.staleWhileRevalidate);

  useStaleWhileRevalidateListaRetry({
    staleWhileRevalidate,
    hasCloudConfig,
    queryClient,
    queryKeyPrefix: ['documentos', 'lista'],
    deps: [filtersForLista],
  });

  const planejamentoDiag = diagQuery.data ?? null;
  const diag = planejamentoDiag ?? DIAG_VAZIO;
  const planejamentoMaisNoLocal =
    hasCloudConfig &&
    documentosSource === 'supabase' &&
    !fallbackReason &&
    diag.noSnapshot >= 0 &&
    diag.noNavegador > diag.noSnapshot;
  const planejamentoNuvemSemLinhas = hasCloudConfig && Boolean(diag.nuvemSemLinhasMaterial);
  // Abort de navegação rápida não é erro. Com grelha boa: aviso suave e temporário.
  const abortedNav =
    listQuery.error instanceof Error && listQuery.error.name === 'AbortError';
  const listError =
    abortedNav
      ? ''
      : listQuery.isError && items.length === 0
        ? listQuery.error instanceof Error
          ? listQuery.error.message
          : 'Nao foi possivel carregar documentos.'
        : listQuery.isError && items.length > 0
          ? 'Nao foi possivel actualizar esta página. A lista anterior permanece visivel — tente de novo.'
          : '';

  const invalidateDocumentosLista = useCallback(async () => {
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
    invalidateDocumentosListaCabIndex();
    await queryClient.invalidateQueries({ queryKey: ['documentos'] });
  }, [queryClient]);

  const enviarPlanejamentoLocalParaNuvem = useCallback(async () => {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para sincronizar.');
      return;
    }
    const ok = await confirm({
      title: 'Enviar planejamento para a nuvem',
      message:
        'Isto substitui o planejamento na nuvem (iso_pro_snapshot) pela copia deste navegador. O app mobile passa a ver esses desenhos. Continuar?',
    });
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
  }, [canAccessAction, confirm, invalidateDocumentosLista]);

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

    const outras = await previewRevisoesActivasOutrasAoSalvar(data.numero, data.revisao, selected?.id);
    if (outras.length > 0) {
      setSalvarRevisoesStaging({ data, currentId: selected?.id, revisoesAntigasActivas: outras });
      return {
        success: false,
        error:
          'Existem outras revisoes activas deste numero. Confirme no dialogo se deseja cancelar as antigas ou gravar so esta.',
      };
    }

    const result = await salvarDocumento(data, selected?.id, { actorLogin: user?.login });
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateDocumentosLista();
      setSuccess(result.meta?.source === 'local' ? 'Documento salvo localmente.' : 'Documento salvo com sucesso.');
    }
    return result;
  }

  async function confirmarSalvarComOpcaoRevisoes(cancelarAntigas: boolean) {
    if (!salvarRevisoesStaging) return;
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para editar documentos.');
      return;
    }
    setSalvarRevisoesBusy(true);
    setError('');
    const staging = salvarRevisoesStaging;
    const result = await salvarDocumento(staging.data, staging.currentId, {
      cancelarRevisoesAntigasActivas: cancelarAntigas,
      actorLogin: user?.login,
    });
    setSalvarRevisoesBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Falha ao salvar documento.');
      return;
    }
    setSalvarRevisoesStaging(null);
    setIsModalOpen(false);
    setSelected(null);
    await invalidateDocumentosLista();
    setSuccess(
      cancelarAntigas
        ? 'Documento salvo e revisoes antigas do mesmo numero canceladas.'
        : result.meta?.source === 'local'
          ? 'Documento salvo localmente.'
          : 'Documento salvo com sucesso.',
    );
  }

  function cancelarSalvarRevisoesStaging() {
    if (salvarRevisoesBusy) return;
    setSalvarRevisoesStaging(null);
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
        !(await confirm({
          message: `Confirma cancelar o documento ${item.numero} rev. ${item.revisao}? O planejamento deixa de ser usado neste fluxo; recebimentos e atendimentos ja lancados nao sao alterados.`,
        }))
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

  /** Acima de ~8 MB de CSV: ZIP (DEFLATE) para download mais leve e estável. */
  async function baixarExportDocumentosCsv(csv: string, fileName: string): Promise<'csv' | 'zip'> {
    const ZIP_THRESHOLD_CHARS = 8_000_000;
    if (csv.length < ZIP_THRESHOLD_CHARS) {
      baixarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
      return 'csv';
    }
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const csvName = fileName.toLowerCase().endsWith('.csv') ? fileName : `${fileName}.csv`;
    zip.file(csvName, csv);
    // Cedência ao UI antes da compressão (exportes grandes).
    await new Promise<void>((r) => setTimeout(r, 0));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const zipName = csvName.replace(/\.csv$/i, '') + '.zip';
    baixarBlob(blob, zipName);
    return 'zip';
  }

  async function exportDocumentosCsvResumo() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar documentos.');
      return;
    }
    if (exportingDocumentosCsv) return;
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
    setExportingDocumentosCsv('tudo');
    try {
      const result = await montarExportacaoDocumentosCsvResumo();
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel gerar o CSV.');
        return;
      }
      const fmt = await baixarExportDocumentosCsv(result.data.csv, result.data.fileName);
      setSuccess(
        fmt === 'zip'
          ? 'Exportacao concluida (ZIP — ficheiro grande). O download foi iniciado.'
          : 'Exportacao concluida. O ficheiro CSV foi descarregado.',
      );
    } finally {
      setExportingDocumentosCsv(null);
    }
  }

  async function exportDocumentosCsvResumoFiltrado() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar documentos.');
      return;
    }
    if (exportingDocumentosCsv) return;
    setError('');
    setSuccess('');
    setImportSnapshotConflict(false);
    setExportingDocumentosCsv('filtro');
    try {
      const result = await montarExportacaoDocumentosCsvResumo({
        filtroLista: { busca: filtersForLista.busca, status: filtersForLista.status },
      });
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel gerar o CSV.');
        return;
      }
      const fmt = await baixarExportDocumentosCsv(result.data.csv, result.data.fileName);
      setSuccess(
        fmt === 'zip'
          ? 'Exportacao (filtro atual) concluida (ZIP — ficheiro grande). O download foi iniciado.'
          : 'Exportacao (filtro atual) concluida. O ficheiro CSV foi descarregado.',
      );
    } finally {
      setExportingDocumentosCsv(null);
    }
  }

  function openImportDocumentosPicker() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar documentos.');
      return;
    }
    setError('');
    importModoRef.current = 'full';
    importInputRef.current?.click();
  }

  function openAtualizarDescricoesPicker() {
    if (!canAccessAction('documentos', 'editar')) {
      setError('Seu perfil nao possui permissao para atualizar descricoes.');
      return;
    }
    setError('');
    importModoRef.current = 'descricoes';
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
    const seq = ++importPreviewSeqRef.current;
    setLendoArquivoImportacao(true);

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && file.type !== 'text/csv' && !lower.endsWith('.txt')) {
      setLendoArquivoImportacao(false);
      setError('Selecione um arquivo CSV (exportado do Excel ou deste modulo).');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setLendoArquivoImportacao(false);
      setError('Nao foi possivel ler o arquivo selecionado.');
      return;
    }
    if (seq !== importPreviewSeqRef.current) return;

    const modo = importModoRef.current;

    if (modo === 'descricoes') {
      const extracted = await extrairDescricoesDocumentosDoCsv(text);
      if (seq !== importPreviewSeqRef.current) return;
      setLendoArquivoImportacao(false);
      if (!extracted.ok) {
        setError(extracted.error);
        return;
      }
      setImportStaging({
        fileName: file.name,
        text,
        linhaCount: extracted.itens.length,
        modo: 'descricoes',
      });
      return;
    }

    const preview = previewImportacaoDocumentosComRevisoesAntigas(text);
    setLendoArquivoImportacao(false);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportStaging({
      fileName: file.name,
      text,
      linhaCount: preview.linhaCount,
      modo: 'full',
      revisoesAntigasActivas: [],
      cancelarRevisoesAntigas: false,
    });

    void carregarRevisoesAntigasActivasDoCsvImportacao(text).then((revisoes) => {
      if (seq !== importPreviewSeqRef.current) return;
      setImportStaging((prev) =>
        prev && prev.text === text && prev.modo === 'full' ? { ...prev, revisoesAntigasActivas: revisoes } : prev,
      );
    });
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
    setImportProgress(importStaging.modo === 'descricoes' ? 'A atualizar descricoes…' : 'A preparar o planejamento…');
    const stagingAtual = importStaging;
    const text = stagingAtual.text;

    try {
    if (stagingAtual.modo === 'descricoes') {
      const result = await atualizarDescricoesDocumentosDoArquivoCsv(text);
      if (!result.success) {
        if (result.data?.detalhes.length) {
          setImportResultado({
            ...result.data,
            mensagem: result.error ?? 'Nenhuma descricao actualizada. Revise o ficheiro e os avisos abaixo.',
            ficheiroOrigem: stagingAtual.fileName,
          });
        } else {
          setError(avisoSeImportacaoNaoFechou(result.error ?? 'Actualizacao de descricoes nao concluida.'));
        }
        return;
      }
      const r = result.data;
      if (!r) {
        setError('Resumo da actualizacao indisponivel.');
        return;
      }
      void invalidateDocumentosLista();
      setImportResultado({
        ...r,
        mensagem: `Concluido. ${r.atualizados} descricao(oes) actualizada(s).`,
        ficheiroOrigem: stagingAtual.fileName,
      });
      return;
    }

    const result = await importarDocumentosDoArquivoCsv(text, {
      cancelarRevisoesAntigasActivas: stagingAtual.cancelarRevisoesAntigas === true,
      actorLogin: user?.login,
      onProgress: (mensagem) => setImportProgress(mensagem),
    });

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
        setImportResultado({
          ...result.data,
          mensagem: result.error ?? 'Nenhuma alteracao aplicada. Revise o ficheiro e os avisos abaixo.',
          ficheiroOrigem: stagingAtual.fileName,
        });
      } else {
        setError(avisoSeImportacaoNaoFechou(result.error ?? 'Importacao nao concluida.'));
      }
      return;
    }

    const r = result.data;
    if (!r) {
      setError('Resumo da importacao indisponivel.');
      return;
    }
    const cancelMsg =
      r.canceladosPorRevisao && r.canceladosPorRevisao > 0
        ? ` ${r.canceladosPorRevisao} revisao(oes) antiga(s) cancelada(s).`
        : '';
    setImportResultado({
      ...r,
      ficheiroOrigem: stagingAtual.fileName,
      mensagem: `Concluido. ${r.criados} novo(s), ${r.atualizados} atualizado(s).${cancelMsg}`,
    });
    void invalidateDocumentosLista();
    } catch {
      setError('A importacao nao confirmou o fim. Atualize a pagina e confira o total antes de importar de novo.');
    } finally {
      setImportingDocumentos(false);
      setImportProgress('');
      setImportStaging(null);
    }
  }

  function setImportStagingCancelarRevisoes(value: boolean) {
    setImportStaging((prev) => (prev ? { ...prev, cancelarRevisoesAntigas: value } : prev));
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
    setImportProgress('A gravar na nuvem…');
    try {
    const result = await importarDocumentosDoArquivoCsv(importHistoricoBloqueio.staging.text, {
      substituirELimparHistoricoIncompativel: true,
      cancelarRevisoesAntigasActivas: importHistoricoBloqueio.staging.cancelarRevisoesAntigas === true,
      actorLogin: user?.login,
      onProgress: (mensagem) => setImportProgress(mensagem),
    });

    if (!result.success) {
      setImportSnapshotConflict(isSnapshotConflictResult(result));
      setError(avisoSeImportacaoNaoFechou(result.error ?? 'Importacao nao concluida apos limpeza de historico.'));
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
    setImportResultado({
      ...r,
      mensagem: `Concluido. ${r.criados} novo(s), ${r.atualizados} atualizado(s).`,
    });
    void invalidateDocumentosLista();
    setSuccess('Planejamento importado. Historico de atendimento incompatible foi removido da nuvem.');
    } catch {
      setError('A importacao nao confirmou o fim. Atualize a pagina e confira o total antes de importar de novo.');
    } finally {
      setImportSubstituirBusy(false);
      setImportProgress('');
    }
  }

  async function reloadAfterImportSnapshotConflict() {
    setImportSnapshotConflict(false);
    await invalidateDocumentosLista();
  }

  return {
    items,
    total,
    loading,
    refreshing,
    error: error || listError,
    success,
    fallbackReason,
    documentosSource,
    staleWhileRevalidate,
    syncingLocalParaNuvem,
    enviarPlanejamentoLocalParaNuvem,
    planejamentoDiag,
    planejamentoMaisNoLocal,
    planejamentoNuvemSemLinhas,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load: invalidateDocumentosLista,
    setFilters,
    prefetchDocumentosPage,
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
    viewDocumentLoading,
    viewDocumentOpeningId,
    viewPlanejamentoMetricas,
    viewPlanejamentoLocalizacoes,
    viewPlanejamentoMetricasAviso,
    viewPlanejamentoMetricasPending,
    closeViewDocument: () => {
      // Invalida o pedido em curso e limpa busy — senao o olho fica disabled («bloqueio»).
      viewDocumentoSeqRef.current += 1;
      setViewDocument(null);
      setViewDocumentLoading(false);
      setViewDocumentOpeningId(null);
      setViewPlanejamentoMetricas(new Map());
      setViewPlanejamentoLocalizacoes(new Map());
      setViewPlanejamentoMetricasAviso(null);
      setViewPlanejamentoMetricasPending(false);
    },
    visualizarPlanejamentoBusyId,
    visualizarPlanejamentoDireto: async (item: DocumentoListItem) => {
      if (visualizarPlanejamentoBusyId) return;
      setError('');
      setVisualizarPlanejamentoBusyId(item.id);
      try {
        const res = await visualizarPlanejamentoCampoPorId(item);
        if (!res.ok) {
          setError(res.error);
        }
      } finally {
        setVisualizarPlanejamentoBusyId(null);
      }
    },
    /**
     * PDF/impressão: usar o que já está no modal.
     * Não voltar a esperar 8–12s de métricas só porque houve aviso —
     * isso tornava «Pré-visualizar» inutilizável.
     */
    ensureViewPlanejamentoMetricas: async (documento: Documento) => {
      const codes = documento.itens.map((it) => it.codigoMaterial).filter(Boolean);
      if (!viewPlanejamentoMetricasPending) {
        if (viewPlanejamentoMetricas.size > 0 || viewPlanejamentoMetricasAviso) {
          return {
            metricas: viewPlanejamentoMetricas,
            localizacoesRecebimentoPorCodigo: viewPlanejamentoLocalizacoes,
            metricasAviso: viewPlanejamentoMetricasAviso,
          };
        }
      }
      setViewPlanejamentoMetricasPending(true);
      try {
        const met = await Promise.race([
          carregarMetricasPlanejamentoVisualizacao(codes),
          new Promise<never>((_, rej) => {
            setTimeout(() => rej(new Error('metricas-ensure-timeout')), 8_000);
          }),
        ]);
        setViewPlanejamentoMetricas(met.metricas);
        setViewPlanejamentoLocalizacoes(met.localizacoesRecebimentoPorCodigo);
        setViewPlanejamentoMetricasAviso(met.metricasAviso ?? null);
        if (met.metricas.size > 0) {
          setViewDocument((prev) => (prev ? documentoComStatusDasLinhas(prev, met.metricas) : prev));
        }
        return {
          metricas: met.metricas,
          localizacoesRecebimentoPorCodigo: met.localizacoesRecebimentoPorCodigo,
          metricasAviso: met.metricasAviso ?? null,
        };
      } catch {
        // Não bloquear PDF com aviso vermelho se já temos mapa — só reutilizar.
        return {
          metricas: viewPlanejamentoMetricas,
          localizacoesRecebimentoPorCodigo: viewPlanejamentoLocalizacoes,
          metricasAviso: viewPlanejamentoMetricasAviso,
        };
      } finally {
        setViewPlanejamentoMetricasPending(false);
      }
    },
    openViewDocumento: async (item: DocumentoListItem) => {
      if (viewDocumentOpeningId === item.id && viewDocumentLoading) return;
      const seq = ++viewDocumentoSeqRef.current;
      setError('');
      setViewDocumentOpeningId(item.id);
      setViewDocument(null);
      setViewPlanejamentoMetricas(new Map());
      setViewPlanejamentoLocalizacoes(new Map());
      setViewPlanejamentoMetricasAviso(null);
      setViewPlanejamentoMetricasPending(false);
      setViewDocumentLoading(true);
      try {
        // 1) Documento ja; 2) metricas em segundo plano — EXE nao fica 20s em «A carregar…».
        const result = await carregarDocumentoPlanejamentoParaVisualizacao(item.id, undefined, {
          deferMetricas: true,
        });
        if (seq !== viewDocumentoSeqRef.current) return;
        if (!result.success || !result.data) {
          setError(result.error ?? 'Nao foi possivel carregar o documento.');
          return;
        }
        setViewDocument(result.data.documento);
        setViewDocumentLoading(false);
        setViewDocumentOpeningId(null);

        if (result.data.metricasPending) {
          const codes = result.data.documento.itens.map((it) => it.codigoMaterial).filter(Boolean);
          // Semente das linhas + memoria → status correcto já (Atendido sem esperar nuvem).
          const semente = metricasSementeDoDocumento(result.data.documento);
          const fromMem = peekMetricasPlanejamentoMemoria(codes);
          const seeded = fundirMetricasPlanejamento(semente, fromMem);
          let temMetricas = seeded.size > 0;
          if (temMetricas) {
            setViewPlanejamentoMetricas(seeded);
            setViewDocument((prev) => (prev ? documentoComStatusDasLinhas(prev, seeded) : prev));
          }
          // Nao bloquear UI com «A actualizar…» se ja ha status util.
          setViewPlanejamentoMetricasPending(false);
          void carregarLocalizacoesPlanejamentoVisualizacao(codes).then((locs) => {
            if (seq !== viewDocumentoSeqRef.current) return;
            setViewPlanejamentoLocalizacoes(locs);
          });
          const applyMet = (metricas: Map<string, MetricasPorCodigoMaterial>, aviso?: string | null) => {
            if (seq !== viewDocumentoSeqRef.current) return;
            if (metricas.size > 0) {
              const merged = fundirMetricasPlanejamento(seeded, metricas);
              temMetricas = true;
              setViewPlanejamentoMetricas(merged);
              setViewDocument((prev) => (prev ? documentoComStatusDasLinhas(prev, merged) : prev));
              setViewPlanejamentoMetricasAviso(null);
              setViewPlanejamentoMetricasPending(false);
              return;
            }
            // Sem mapa da nuvem: manter semente; aviso so se nem semente ajuda.
            if (aviso && !temMetricas) setViewPlanejamentoMetricasAviso(aviso);
            else setViewPlanejamentoMetricasAviso(null);
          };
          void carregarSoMetricasPlanejamentoVisualizacao(codes, {
            onPartial: (partial) => applyMet(partial),
          })
            .then((met) => {
              applyMet(met.metricas, met.metricasAviso ?? null);
            })
            .catch(() => {
              if (seq !== viewDocumentoSeqRef.current) return;
              // Mantem semente; sem banner vermelho se ja ha status das linhas.
              if (!temMetricas) {
                setViewPlanejamentoMetricasAviso(
                  'Estoque da nuvem indisponivel de momento. Status pelas quantidades do documento.',
                );
              } else {
                setViewPlanejamentoMetricasAviso(null);
              }
            })
            .finally(() => {
              if (seq === viewDocumentoSeqRef.current) {
                setViewPlanejamentoMetricasPending(false);
              }
            });
        } else {
          setViewPlanejamentoMetricas(result.data.metricas);
          setViewPlanejamentoLocalizacoes(result.data.localizacoesRecebimentoPorCodigo);
          setViewPlanejamentoMetricasAviso(result.data.metricasAviso ?? null);
        }
      } catch {
        if (seq === viewDocumentoSeqRef.current) {
          setError('Nao foi possivel abrir o documento. Tente de novo.');
        }
      } finally {
        if (seq === viewDocumentoSeqRef.current) {
          setViewDocumentLoading(false);
          setViewDocumentOpeningId(null);
        }
      }
    },
    submitDocumento,
    handleCancelar,
    importInputRef,
    importSnapshotConflict,
    importStaging,
    importingDocumentos,
    importProgress,
    lendoArquivoImportacao,
    importResultado,
    setImportStagingCancelarRevisoes,
    salvarRevisoesStaging,
    salvarRevisoesBusy,
    confirmarSalvarComOpcaoRevisoes,
    cancelarSalvarRevisoesStaging,
    exportDocumentosCsvResumo,
    exportDocumentosCsvResumoFiltrado,
    exportingDocumentosCsv,
    openImportDocumentosPicker,
    openAtualizarDescricoesPicker,
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
