import { useCallback, useEffect, useMemo, useState } from 'react';
import { collectAllPages } from '../../../lib/collectAllPages';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { excluirRir, listarRir, salvarRir, validateRir } from '../services/qualidade.service';
import type { RirFiltro, RirFormData, RirRegistro } from '../types/qualidade.types';
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

export function useRir() {
  const { canAccessAction } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const modoNumeracao = readConfiguracoes().rirModoNumeracao;
  const [filters, setFilters] = useState<RirFiltro>(initialFilters);
  const [items, setItems] = useState<RirRegistro[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<RirRegistro | null>(null);
  const [recebimentoChoices, setRecebimentoChoices] = useState<Array<{ id: string; label: string; notaFiscal: string }>>([]);
  const [recebimentosChoicesLoading, setRecebimentosChoicesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const result = await listarRir(filters);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar RIR.');
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

  useEffect(() => {
    let cancelled = false;
    setRecebimentosChoicesLoading(true);
    void (async () => {
      try {
        const items = await collectAllPages(async (page, pageSize) => {
          const r = await listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize });
          if (!r.success || !r.data) return { data: undefined };
          return { data: r.data };
        });
        if (cancelled) return;
        setRecebimentoChoices(
          items.map((it) => ({
            id: it.id,
            notaFiscal: it.notaFiscal,
            label: `NF ${it.notaFiscal || '—'} · ${it.fornecedor} · ${it.dataRecebimento}`,
          })),
        );
      } finally {
        if (!cancelled) setRecebimentosChoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setSuccess(result.meta?.source === 'local' ? 'RIR salvo localmente.' : 'RIR salvo com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      await load();
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
      setSuccess(result.meta?.source === 'local' ? 'RIR excluido localmente.' : 'RIR excluido com sucesso.');
      await load();
    } else if (result.error) {
      setError(result.error);
    }
    return result;
  }

  return {
    items,
    total,
    loading,
    error,
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
    load,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('rir', 'editar')) {
        setError('Seu perfil nao possui permissao para criar RIR.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: (item: RirRegistro) => {
      if (!canAccessAction('rir', 'editar')) {
        setError('Seu perfil nao possui permissao para editar RIR.');
        return;
      }
      if (item.status === 'tratado' || item.status === 'cancelado') {
        setError('RIR tratado ou cancelado nao pode ser editado por este fluxo.');
        return;
      }
      setSelected(item);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitRir,
    removeRir,
  };
}
