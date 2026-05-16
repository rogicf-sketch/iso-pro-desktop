import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { isSnapshotConflictResult } from '../../../lib/service-result';
import { verifyCurrentUserPassword } from '../../auth/services/auth.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { resolverNomeFornecedorCadastradoAtivo } from '../../fornecedores/services/fornecedores.service';
import { validarCodigosMateriaisAtivosNoCadastroParaRecebimento } from '../../materiais/services/materiais.service';
import { validateRecebimento } from '../schemas/recebimento.schema';
import {
  buscarRecebimentoPorId,
  cancelarRecebimento,
  destravarRecebimentoParaCorrecaoAdministrativa,
  excluirRecebimentosDefinitivamente,
  importarRecebimentosDoArquivoCsv,
  listarRecebimentos,
  montarModeloCsvImportacaoRecebimentos,
  montarModeloCsvImportacaoRecebimentosItens,
  montarExportacaoRecebimentosCsvItens,
  obterIdsRecebimentosFiltrados,
  obterResumosRecebimentosParaExclusao,
  previewImportacaoRecebimentosCsv,
  salvarRecebimento,
} from '../services/recebimentos.service';
import type {
  Recebimento,
  RecebimentoFiltro,
  RecebimentoFormData,
  RecebimentoListItem,
  RecebimentosImportacaoResumo,
} from '../types/recebimento.types';

const initialFilters: RecebimentoFiltro = {
  busca: '',
  status: 'todos',
  modo: 'todos',
  page: 1,
  pageSize: 6,
};

const emptyForm: RecebimentoFormData = {
  fornecedor: '',
  dataRecebimento: new Date().toISOString().slice(0, 10),
  notaFiscal: '',
  romaneio: '',
  conferente: '',
  modoRecebimento: 'direto',
  observacoes: '',
  itens: [],
};

function recebimentosListaQueryKey(filters: RecebimentoFiltro, userLogin: string | undefined) {
  return ['recebimentos', 'lista', userLogin ?? '', filters] as const;
}

export function useRecebimentos() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<RecebimentoFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  /** Somente leitura: ver cabecalho e itens sem editar (ex.: recebimento conferido). */
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [selected, setSelected] = useState<Recebimento | null>(null);
  const [idsParaExcluirRecebimentos, setIdsParaExcluirRecebimentos] = useState<string[]>([]);
  const [excluirModalResumos, setExcluirModalResumos] = useState<Array<{ notaFiscal: string; romaneio: string; fornecedor: string }>>([]);
  const [excluirModalResumosLoading, setExcluirModalResumosLoading] = useState(false);
  const [excluirDefinitivoSenha, setExcluirDefinitivoSenha] = useState('');
  const [excluirDefinitivoBusy, setExcluirDefinitivoBusy] = useState(false);
  const [destravarContext, setDestravarContext] = useState<RecebimentoListItem | null>(null);
  const [destravarSenha, setDestravarSenha] = useState('');
  const [destravarBusy, setDestravarBusy] = useState(false);
  const [selectedRecebimentoIds, setSelectedRecebimentoIds] = useState<string[]>([]);
  const filterSelectionKey = `${filters.busca}\u0001${filters.status}\u0001${filters.modo}\u0001${filters.pageSize}`;
  const [prevFilterSelectionKey, setPrevFilterSelectionKey] = useState(filterSelectionKey);
  if (filterSelectionKey !== prevFilterSelectionKey) {
    setPrevFilterSelectionKey(filterSelectionKey);
    setSelectedRecebimentoIds([]);
  }
  const [selectAllFilteredBusy, setSelectAllFilteredBusy] = useState(false);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const importMassInputRef = useRef<HTMLInputElement>(null);
  const [importMassStaging, setImportMassStaging] = useState<{
    fileName: string;
    text: string;
    linhaCount: number;
    recebimentoCount: number;
  } | null>(null);
  const [importingRecebimentosMass, setImportingRecebimentosMass] = useState(false);
  const [importMassResultado, setImportMassResultado] = useState<RecebimentosImportacaoResumo | null>(null);
  const [importMassSnapshotConflict, setImportMassSnapshotConflict] = useState(false);

  const selectedRecebimentoIdSet = useMemo(() => new Set(selectedRecebimentoIds), [selectedRecebimentoIds]);
  const idsParaExcluirKey = idsParaExcluirRecebimentos.slice().sort().join('\u0001');

  if (idsParaExcluirRecebimentos.length === 0) {
    if (excluirModalResumos.length > 0) {
      setExcluirModalResumos([]);
    }
    if (excluirModalResumosLoading) {
      setExcluirModalResumosLoading(false);
    }
  }

  const listQuery = useQuery({
    queryKey: recebimentosListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarRecebimentos(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar recebimentos.');
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
        ? 'Nao foi possivel carregar recebimentos.'
        : '';

  const invalidateRecebimentosLista = useCallback(async () => {
    setError('');
    setSuccess('');
    setImportMassSnapshotConflict(false);
    await queryClient.invalidateQueries({ queryKey: ['recebimentos'] });
  }, [queryClient]);

  useEffect(() => {
    if (!idsParaExcluirRecebimentos.length) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExcluirModalResumosLoading(true);
    });
    void obterResumosRecebimentosParaExclusao(idsParaExcluirRecebimentos).then((result) => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idsParaExcluirKey estabiliza idsParaExcluirRecebimentos
  }, [idsParaExcluirKey]);

  const formInitialValue = useMemo<RecebimentoFormData>(
    () =>
      selected
        ? {
            fornecedor: selected.fornecedor,
            dataRecebimento: selected.dataRecebimento,
            notaFiscal: selected.notaFiscal,
            romaneio: selected.romaneio,
            conferente: selected.conferente,
            modoRecebimento: selected.modoRecebimento,
            observacoes: selected.observacoes,
            itens: selected.itens,
          }
        : emptyForm,
    [selected],
  );

  async function submitRecebimento(data: RecebimentoFormData) {
    if (!canAccessAction('recebimentos', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar recebimentos.' };
    }
    const validationError = validateRecebimento(data);
    if (validationError) return { success: false, error: validationError };

    const duplicatedCodes = new Set<string>();
    for (const item of data.itens) {
      const code = item.codigoMaterial.trim().toLowerCase();
      if (duplicatedCodes.has(code)) {
        return { success: false, error: `Nao e permitido repetir o material ${item.codigoMaterial} no mesmo recebimento.` };
      }
      duplicatedCodes.add(code);
    }

    const fornecedorCadastrado = await resolverNomeFornecedorCadastradoAtivo(data.fornecedor);
    if (!fornecedorCadastrado) {
      return {
        success: false,
        error:
          'Fornecedor nao cadastrado ou inativo. Abra o modulo Fornecedores, cadastre o fornecedor como ativo e use o mesmo nome ao gravar (ou selecione na lista).',
      };
    }

    const erroMateriais = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
      data.itens.map((it) => it.codigoMaterial),
      'salvar',
      'recebimento',
    );
    if (erroMateriais) {
      return { success: false, error: erroMateriais };
    }

    const result = await salvarRecebimento({ ...data, fornecedor: fornecedorCadastrado }, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateRecebimentosLista();
      setSuccess(result.meta?.source === 'local' ? 'Recebimento salvo localmente.' : 'Recebimento salvo com sucesso.');
    }

    return result;
  }

  async function handleCancelar(item: RecebimentoListItem) {
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar recebimentos.');
      return;
    }
    if (item.status === 'cancelado') {
      setError('Este recebimento ja esta cancelado.');
      return;
    }
    if (item.status !== 'aguardando_conferencia') {
      setError('Recebimentos com conferencia iniciada nao podem ser cancelados por este fluxo.');
      return;
    }
    if (!window.confirm(`Confirma o cancelamento do recebimento ${item.notaFiscal || item.id}?`)) {
      return;
    }
    const result = await cancelarRecebimento(item.id);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel cancelar recebimento.');
      return;
    }
    await invalidateRecebimentosLista();
    setSuccess(result.meta?.source === 'local' ? 'Recebimento cancelado localmente.' : 'Recebimento cancelado com sucesso.');
  }

  function toggleSelectRecebimentoId(id: string) {
    setSelectedRecebimentoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectRecebimentosPaginaAtual() {
    const pageIds = items.map((i) => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedRecebimentoIdSet.has(id));
    if (allSelected) {
      setSelectedRecebimentoIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedRecebimentoIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  }

  async function selectAllRecebimentosFiltered() {
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar recebimentos.');
      return;
    }
    setError('');
    setSelectAllFilteredBusy(true);
    const result = await obterIdsRecebimentosFiltrados(filtersForLista);
    setSelectAllFilteredBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel selecionar todos os recebimentos do filtro.');
      return;
    }
    setSelectedRecebimentoIds(result.data);
  }

  function clearRecebimentosSelection() {
    setSelectedRecebimentoIds([]);
  }

  function abrirExclusaoDefinitivaRecebimento(item: RecebimentoListItem) {
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir recebimentos definitivamente.');
      return;
    }
    setError('');
    setExcluirDefinitivoSenha('');
    setIdsParaExcluirRecebimentos([item.id]);
  }

  function abrirExclusaoDefinitivaEmMassa() {
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir recebimentos definitivamente.');
      return;
    }
    if (!selectedRecebimentoIds.length) return;
    setError('');
    setExcluirDefinitivoSenha('');
    setIdsParaExcluirRecebimentos(selectedRecebimentoIds);
  }

  function fecharExclusaoDefinitivaRecebimento() {
    if (excluirDefinitivoBusy) return;
    setIdsParaExcluirRecebimentos([]);
    setExcluirDefinitivoSenha('');
  }

  function abrirDestravarRecebimento(item: RecebimentoListItem) {
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar recebimentos.');
      return;
    }
    const ok =
      item.status === 'conferido' || item.status === 'parcialmente_conferido' || item.status === 'divergente';
    if (!ok) {
      setError('So e possivel destravar recebimentos conferidos (total ou parcial) ou divergentes.');
      return;
    }
    setError('');
    setDestravarSenha('');
    setDestravarContext(item);
  }

  function fecharDestravarRecebimento() {
    if (destravarBusy) return;
    setDestravarContext(null);
    setDestravarSenha('');
  }

  async function confirmarDestravarRecebimento() {
    if (!destravarContext) return;
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar recebimentos.');
      return;
    }
    setError('');
    setDestravarBusy(true);
    const senhaOk = await verifyCurrentUserPassword(destravarSenha);
    if (!senhaOk) {
      setError('Senha incorreta.');
      setDestravarBusy(false);
      return;
    }
    const id = destravarContext.id;
    const result = await destravarRecebimentoParaCorrecaoAdministrativa(id, { actorLogin: user?.login });
    setDestravarBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel destravar o recebimento.');
      return;
    }
    setDestravarContext(null);
    setDestravarSenha('');
    await invalidateRecebimentosLista();
    setSuccess(
      result.meta?.source === 'local'
        ? 'Recebimento destravado (gravacao local). Pode editar, cancelar ou excluir conforme as permissoes.'
        : 'Recebimento destravado. Pode editar, cancelar ou excluir conforme as permissoes.',
    );
    if (canAccessAction('recebimentos', 'editar')) {
      const carregar = await buscarRecebimentoPorId(id);
      if (carregar.success && carregar.data && carregar.data.status !== 'cancelado') {
        setIsViewOnly(false);
        setSelected(carregar.data);
        setIsModalOpen(true);
      }
    }
  }

  async function confirmarExclusaoDefinitivaRecebimento() {
    if (!idsParaExcluirRecebimentos.length) return;
    if (!canAccessAction('recebimentos', 'administrar')) {
      setError('Seu perfil nao possui permissao para excluir recebimentos definitivamente.');
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
    const ids = [...idsParaExcluirRecebimentos];
    const result = await excluirRecebimentosDefinitivamente(ids, { actorLogin: user?.login });
    setExcluirDefinitivoBusy(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel excluir o(s) recebimento(s).');
      return;
    }
    const rem = result.data.removidos;
    setIdsParaExcluirRecebimentos([]);
    setExcluirDefinitivoSenha('');
    setSelectedRecebimentoIds((prev) => prev.filter((id) => !ids.includes(id)));
    if (selected && ids.includes(selected.id)) {
      setSelected(null);
      setIsViewOnly(false);
      setIsModalOpen(false);
    }
    await invalidateRecebimentosLista();
    setSuccess(
      result.meta?.source === 'local'
        ? `Exclusao definitiva: ${rem} recebimento(s) removido(s) (gravacao local).`
        : `Exclusao definitiva: ${rem} recebimento(s) removido(s).`,
    );
  }

  function baixarBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** CSV com cabecalho do recebimento + uma linha por item; respeita busca/status/modo da tela (filtros em branco = todos). */
  async function exportRecebimentosExcel() {
    if (!canAccessAction('recebimentos', 'editar')) {
      setError('Seu perfil nao possui permissao para exportar recebimentos.');
      return;
    }
    setError('');
    const result = await montarExportacaoRecebimentosCsvItens({
      filtroLista: { busca: filtersForLista.busca, status: filtersForLista.status, modo: filtersForLista.modo },
    });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar o CSV.');
      return;
    }
    baixarBlob(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }), result.data.fileName);
    setSuccess('Exportacao Excel (CSV) concluida — nota fiscal, fornecedor, romaneio e linhas de material.');
  }

  function downloadModeloCsvImportacaoRecebimentos() {
    if (!canAccessAction('recebimentos', 'editar')) {
      setError('Seu perfil nao possui permissao para baixar o modelo.');
      return;
    }
    setError('');
    const { csv, fileName } = montarModeloCsvImportacaoRecebimentos();
    baixarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
    setSuccess('Modelo CSV (importacao em massa) baixado — fornecedor, NF e linhas de material no mesmo arquivo.');
  }

  function downloadModeloCsvImportacaoRecebimentosItens() {
    if (!canAccessAction('recebimentos', 'editar')) {
      setError('Seu perfil nao possui permissao para baixar o modelo.');
      return;
    }
    setError('');
    const { csv, fileName } = montarModeloCsvImportacaoRecebimentosItens();
    baixarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
    setSuccess('Modelo CSV de itens baixado — use em Novo recebimento > Importar itens (CSV).');
  }

  function openImportRecebimentosMassaPicker() {
    if (!canAccessAction('recebimentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar recebimentos.');
      return;
    }
    setError('');
    importMassInputRef.current?.click();
  }

  async function stageImportRecebimentosMassaFromFile(file: File | null) {
    if (!file) return;
    if (!canAccessAction('recebimentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar recebimentos.');
      return;
    }
    setError('');
    setSuccess('');
    setImportMassSnapshotConflict(false);
    setImportMassResultado(null);

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && file.type !== 'text/csv' && !lower.endsWith('.txt')) {
      setError('Selecione um arquivo CSV (mesmo formato do modelo importacao em massa).');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('Nao foi possivel ler o arquivo selecionado.');
      return;
    }

    const preview = await previewImportacaoRecebimentosCsv(text);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportMassStaging({
      fileName: file.name,
      text,
      linhaCount: preview.linhaCount,
      recebimentoCount: preview.recebimentoCount,
    });
  }

  function cancelImportRecebimentosMassaStaging() {
    if (importingRecebimentosMass) return;
    setImportMassStaging(null);
  }

  function closeImportRecebimentosMassaResultado() {
    setImportMassResultado(null);
  }

  async function confirmImportRecebimentosMassaStaging() {
    if (!importMassStaging) return;
    if (!canAccessAction('recebimentos', 'editar')) {
      setError('Seu perfil nao possui permissao para importar recebimentos.');
      return;
    }
    setError('');
    setSuccess('');
    setImportMassSnapshotConflict(false);
    setImportingRecebimentosMass(true);
    const text = importMassStaging.text;

    const result = await importarRecebimentosDoArquivoCsv(text);
    setImportingRecebimentosMass(false);
    setImportMassStaging(null);

    if (!result.success) {
      setImportMassSnapshotConflict(isSnapshotConflictResult(result));
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
    await invalidateRecebimentosLista();
    setImportMassResultado(r);
  }

  async function reloadAfterImportMassSnapshotConflict() {
    setImportMassSnapshotConflict(false);
    await invalidateRecebimentosLista();
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
    load: invalidateRecebimentosLista,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('recebimentos', 'editar')) {
        setError('Seu perfil nao possui permissao para criar recebimentos.');
        return;
      }
      setIsViewOnly(false);
      setSelected(null);
      setIsModalOpen(true);
    },
    openViewModal: async (item: RecebimentoListItem) => {
      setError('');
      const result = await buscarRecebimentoPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o recebimento.');
        return;
      }
      setSelected(result.data);
      setIsViewOnly(true);
      setIsModalOpen(true);
    },
    openEditModal: async (item: RecebimentoListItem) => {
      if (!canAccessAction('recebimentos', 'editar')) {
        setError('Seu perfil nao possui permissao para editar recebimentos.');
        return;
      }
      if (item.status === 'cancelado') {
        setError('Recebimentos cancelados nao podem ser editados.');
        return;
      }
      if (item.status !== 'aguardando_conferencia') {
        setError('Recebimentos com conferencia iniciada nao podem ser editados por este fluxo.');
        return;
      }
      const result = await buscarRecebimentoPorId(item.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel carregar o recebimento.');
        return;
      }
      setIsViewOnly(false);
      setSelected(result.data);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsViewOnly(false);
      setIsModalOpen(false);
    },
    isViewOnly,
    submitRecebimento,
    handleCancelar,
    exportRecebimentosExcel,
    downloadModeloCsvImportacaoRecebimentos,
    downloadModeloCsvImportacaoRecebimentosItens,
    importMassInputRef,
    importMassStaging,
    importingRecebimentosMass,
    importMassResultado,
    importMassSnapshotConflict,
    openImportRecebimentosMassaPicker,
    stageImportRecebimentosMassaFromFile,
    cancelImportRecebimentosMassaStaging,
    confirmImportRecebimentosMassaStaging,
    closeImportRecebimentosMassaResultado,
    reloadAfterImportMassSnapshotConflict,
    idsParaExcluirRecebimentos,
    excluirModalResumos,
    excluirModalResumosLoading,
    excluirDefinitivoSenha,
    setExcluirDefinitivoSenha,
    excluirDefinitivoBusy,
    abrirExclusaoDefinitivaRecebimento,
    abrirExclusaoDefinitivaEmMassa,
    fecharExclusaoDefinitivaRecebimento,
    confirmarExclusaoDefinitivaRecebimento,
    destravarContext,
    destravarSenha,
    setDestravarSenha,
    destravarBusy,
    abrirDestravarRecebimento,
    fecharDestravarRecebimento,
    confirmarDestravarRecebimento,
    selectedRecebimentoIds,
    selectedRecebimentoIdSet,
    toggleSelectRecebimentoId,
    toggleSelectRecebimentosPaginaAtual,
    selectAllRecebimentosFiltered,
    selectAllFilteredBusy,
    clearRecebimentosSelection,
  };
}
