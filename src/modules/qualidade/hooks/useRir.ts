import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { collectAllPages } from '../../../lib/collectAllPages';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { verifyCurrentUserPassword } from '../../auth/services/auth.service';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import {
  destravarRirParaCorrecaoAdministrativa,
  excluirRir,
  listarRir,
  montarExportacaoRirCsvCompleto,
  rirNaoCanceladosPorRecebimentoId,
  salvarRir,
  validateRir,
} from '../services/qualidade.service';
import type { RirFiltro, RirFormData, RirRecebimentoChoice, RirRegistro } from '../types/qualidade.types';
import { rirObraDefaultsFromConfig } from '../utils/rirConfigDefaults';

const initialFilters: RirFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 6,
};

const emptyForm: RirFormData = {
  codigo: '',
  dataRegistro: new Date().toISOString().slice(0, 10),
  recebimentoId: '',
  uo: '',
  localObra: '',
  contratoNumero: '',
  fornecedorNome: '',
  inspecaoQuantitativa: true,
  inspecaoQualitativa: true,
  inspecaoDimensional: false,
  procedimentoNumero: '',
  solCompraPackList: '',
  obsCurta: '',
  itensRir: [],
  instrumentos: '',
  documentosQc: '',
  observacoesQc: '',
  laudo: 'aprovado',
  assinaturaRecebimento: { nome: '', data: '' },
  assinaturaCq: { nome: '', data: '' },
  assinaturaCliente: { nome: '', data: '' },
  origem: '',
  responsavel: '',
  descricao: '',
  acaoImediata: '',
  observacoes: '',
};

function rirListaQueryKey(filters: RirFiltro, userLogin: string | undefined) {
  return ['rir', 'lista', userLogin ?? '', filters] as const;
}

export function useRir() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const modoNumeracao = readConfiguracoes().rirModoNumeracao;
  const [filters, setFilters] = useState<RirFiltro>(initialFilters);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<RirRegistro | null>(null);
  /** Incrementa ao abrir o formulario (novo/editar/destravar) — forca remount com `key`. */
  const [rirFormInstance, setRirFormInstance] = useState(0);
  const [recebimentoChoices, setRecebimentoChoices] = useState<RirRecebimentoChoice[]>([]);
  const [recebimentosChoicesLoading, setRecebimentosChoicesLoading] = useState(false);
  const [rirDestravarAlvo, setRirDestravarAlvo] = useState<RirRegistro | null>(null);
  const [rirDestravarSenha, setRirDestravarSenha] = useState('');
  const [rirDestravarBusy, setRirDestravarBusy] = useState(false);

  const debouncedBusca = useDebouncedValue(filters.busca, LISTA_BUSCA_DEBOUNCE_MS);
  const filtersForLista = useMemo(() => ({ ...filters, busca: debouncedBusca }), [filters, debouncedBusca]);

  const listQuery = useQuery({
    queryKey: rirListaQueryKey(filtersForLista, user?.login),
    queryFn: async () => {
      const result = await listarRir(filtersForLista);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Nao foi possivel carregar RIR.');
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
        ? 'Nao foi possivel carregar RIR.'
        : '';

  const invalidateRirLista = useCallback(async () => {
    setError('');
    setSuccess('');
    await queryClient.invalidateQueries({ queryKey: ['rir'] });
  }, [queryClient]);

  /** Ao abrir o modal (novo/editar), recarrega recebimentos + mapa RIR para filtro «sem RIR» e avisos. */
  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    setRecebimentosChoicesLoading(true);
    void (async () => {
      try {
        const [recItems, rirRes] = await Promise.all([
          collectAllPages(async (page, pageSize) => {
            const r = await listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize });
            if (!r.success || !r.data) return { data: undefined };
            return { data: r.data };
          }),
          listarRir({ busca: '', status: 'todos', page: 1, pageSize: 500_000 }),
        ]);
        if (cancelled) return;
        const rirItems = rirRes.success && rirRes.data ? rirRes.data.items : [];
        const map = rirNaoCanceladosPorRecebimentoId(rirItems);
        setRecebimentoChoices(
          recItems.map((it) => {
            const ex = map.get(it.id) ?? [];
            return {
              id: it.id,
              notaFiscal: it.notaFiscal,
              label: `NF ${it.notaFiscal || '—'} · ${it.fornecedor} · ${it.dataRecebimento}`,
              possuiRirNaoCancelado: ex.length > 0,
              rirExistentes: ex,
            };
          }),
        );
      } finally {
        if (!cancelled) setRecebimentosChoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  const formInitialValue = useMemo<RirFormData>(() => {
    if (selected) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- retirar id do estado do formulário
      const { id, ...rest } = selected;
      return rest as RirFormData;
    }
    const ob = rirObraDefaultsFromConfig(readConfiguracoes());
    return {
      ...emptyForm,
      dataRegistro: new Date().toISOString().slice(0, 10),
      uo: ob.uo,
      localObra: ob.localObra,
      contratoNumero: ob.contratoNumero,
    };
  }, [selected]);

  async function submitRir(data: RirFormData) {
    if (!canAccessAction('rir', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar RIR.' };
    }
    const validationError = validateRir(data);
    if (validationError) return { success: false, error: validationError };
    const result = await salvarRir(data, selected?.id);
    if (result.success) {
      setIsModalOpen(false);
      setSelected(null);
      await invalidateRirLista();
      setSuccess(result.meta?.source === 'local' ? 'RIR salvo localmente.' : 'RIR salvo com sucesso.');
    }
    return result;
  }

  async function removeRir(id: string) {
    if (!canAccessAction('rir', 'editar')) {
      setError('Seu perfil nao possui permissao para excluir RIR.');
      return { success: false, error: 'Seu perfil nao possui permissao para excluir RIR.' };
    }
    setError('');
    setSuccess('');
    const result = await excluirRir(id);
    if (result.success) {
      await invalidateRirLista();
      setSuccess(result.meta?.source === 'local' ? 'RIR excluido localmente.' : 'RIR excluido com sucesso.');
    } else if (result.error) {
      setError(result.error);
    }
    return result;
  }

  async function exportarRirExcel() {
    if (!canAccessAction('rir', 'visualizar')) {
      setError('Seu perfil nao possui permissao para exportar RIR.');
      return;
    }
    setError('');
    setSuccess('');
    const result = await montarExportacaoRirCsvCompleto({
      filtroLista: { busca: filtersForLista.busca, status: filtersForLista.status },
    });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar o CSV.');
      return;
    }
    const url = URL.createObjectURL(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.data.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess('Exportacao Excel (CSV) concluida — relatorio completo, uma linha por material.');
  }

  return {
    items,
    total,
    loading,
    error: error || listError,
    success,
    fallbackReason,
    hasCloudConfig,
    modoNumeracao,
    recebimentoChoices,
    recebimentosChoicesLoading,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    rirFormInstance,
    load: invalidateRirLista,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('rir', 'editar')) {
        setError('Seu perfil nao possui permissao para criar RIR.');
        return;
      }
      setSelected(null);
      setRirFormInstance((n) => n + 1);
      setIsModalOpen(true);
    },
    openEditModal: (item: RirRegistro) => {
      if (!canAccessAction('rir', 'editar')) {
        setError('Seu perfil nao possui permissao para editar RIR.');
        return;
      }
      if (item.status === 'tratado' || item.status === 'cancelado') {
        setError(
          item.status === 'tratado'
            ? 'RIR finalizado (Tratado): use Destravar com a sua senha para voltar a Em analise e poder corrigir.'
            : 'RIR cancelado nao pode ser editado por este fluxo.',
        );
        return;
      }
      setSelected(item);
      setRirFormInstance((n) => n + 1);
      setIsModalOpen(true);
    },
    abrirDestravarRir: (item: RirRegistro) => {
      if (!canAccessAction('rir', 'administrar')) {
        setError('Seu perfil nao possui permissao para administrar RIR (destravar registos finalizados).');
        return;
      }
      if (item.status !== 'tratado') {
        setError('So e possivel destravar RIR com status Tratado (finalizado).');
        return;
      }
      setError('');
      setRirDestravarSenha('');
      setRirDestravarAlvo(item);
    },
    fecharDestravarRir: () => {
      if (rirDestravarBusy) return;
      setRirDestravarAlvo(null);
      setRirDestravarSenha('');
    },
    setRirDestravarSenha,
    confirmarDestravarRir: async () => {
      if (!rirDestravarAlvo) return;
      if (!canAccessAction('rir', 'administrar')) {
        setError('Seu perfil nao possui permissao para administrar RIR.');
        return;
      }
      setError('');
      setRirDestravarBusy(true);
      const senhaOk = await verifyCurrentUserPassword(rirDestravarSenha);
      if (!senhaOk) {
        setError('Senha incorreta.');
        setRirDestravarBusy(false);
        return;
      }
      const id = rirDestravarAlvo.id;
      const result = await destravarRirParaCorrecaoAdministrativa(id, { actorLogin: user?.login });
      setRirDestravarBusy(false);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel destravar o RIR.');
        return;
      }
      setRirDestravarAlvo(null);
      setRirDestravarSenha('');
      await invalidateRirLista();
      setSuccess(
        result.meta?.source === 'local'
          ? 'RIR destravado (gravacao local). Status: Em analise — pode editar ou excluir.'
          : 'RIR destravado. Status: Em analise — pode editar ou excluir.',
      );
      if (canAccessAction('rir', 'editar')) {
        setSelected(result.data);
        setRirFormInstance((n) => n + 1);
        setIsModalOpen(true);
      }
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitRir,
    removeRir,
    exportarRirExcel,
    rirDestravarAlvo,
    rirDestravarSenha,
    rirDestravarBusy,
  };
}
