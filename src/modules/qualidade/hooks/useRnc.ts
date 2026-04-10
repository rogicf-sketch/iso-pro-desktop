import { useCallback, useEffect, useMemo, useState } from 'react';
import { collectAllPages } from '../../../lib/collectAllPages';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRnc, salvarRnc, validateRnc } from '../services/qualidade.service';
import type { RncFiltro, RncFormData, RncRegistro } from '../types/qualidade.types';
import {
  defaultRncEvidencias,
  defaultRncPlanoLinhas,
  defaultRncTiposOcorrencia,
} from '../types/qualidade.types';

const initialFilters: RncFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 6,
};

const emptyAssinatura = (): RncFormData['assinaturaResponsavelRnc'] => ({ nome: '', data: '' });

const emptyForm: RncFormData = {
  codigo: '',
  dataRegistro: new Date().toISOString().slice(0, 10),
  setor: '',
  responsavel: '',
  descricao: '',
  planoAcao: '',
  observacoes: '',
  recebimentoId: '',
  recebimentoNotaFiscal: '',
  recebimentoFornecedor: '',
  recebimentoRomaneio: '',
  recebimentoData: '',
  pedidoCompra: '',
  itemRecebimentoId: '',
  materialCodigo: '',
  materialDescricao: '',
  quantidadeRejeitada: 0,
  quantidadeRecebidaRef: 0,
  localArmazenagem: '',
  localArmazenagemOutro: '',
  tiposOcorrencia: defaultRncTiposOcorrencia(),
  descricaoDetalhada: '',
  evidencias: defaultRncEvidencias(),
  evidenciasObservacao: '',
  acaoImediataTipo: '',
  acaoImediataObservacoes: '',
  analiseCausaRaiz: '',
  planoAcaoLinhas: defaultRncPlanoLinhas(),
  encerramentoParecer: '',
  assinaturaResponsavelRnc: emptyAssinatura(),
  assinaturaQualidade: emptyAssinatura(),
  assinaturaFornecedor: emptyAssinatura(),
  itensRnc: [],
  senhaPreferencial: '',
};

export function useRnc() {
  const { canAccessAction } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const senhaConfigurada = Boolean(readConfiguracoes().rncPrefSenha);
  const [filters, setFilters] = useState<RncFiltro>(initialFilters);
  const [items, setItems] = useState<RncRegistro[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<RncRegistro | null>(null);
  const [recebimentoChoices, setRecebimentoChoices] = useState<Array<{ id: string; label: string; notaFiscal: string }>>([]);
  const [recebimentosChoicesLoading, setRecebimentosChoicesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    const result = await listarRnc(filters);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel carregar RNC.');
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

  const formInitialValue = useMemo<RncFormData>(() => {
    if (!selected) {
      return {
        ...emptyForm,
        dataRegistro: new Date().toISOString().slice(0, 10),
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- id fica fora do formulario
    const { id, ...rest } = selected;
    return { ...rest, senhaPreferencial: '' } as RncFormData;
  }, [selected]);

  async function submitRnc(data: RncFormData) {
    if (!canAccessAction('rnc', 'editar')) {
      return { success: false, error: 'Seu perfil nao possui permissao para editar RNC.' };
    }
    const validationError = validateRnc(data);
    if (validationError) return { success: false, error: validationError };
    if (
      (data.status === 'concluido' || data.status === 'cancelado') &&
      !window.confirm(`Confirma salvar a RNC com status ${data.status === 'concluido' ? 'concluido' : 'cancelado'}?`)
    ) {
      return { success: false, error: 'Operacao cancelada pelo usuario.' };
    }
    const result = await salvarRnc(data, selected?.id);
    if (result.success) {
      setSuccess(result.meta?.source === 'local' ? 'RNC salva localmente.' : 'RNC salva com sucesso.');
      setIsModalOpen(false);
      setSelected(null);
      await load();
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
    senhaConfigurada,
    recebimentoChoices,
    recebimentosChoicesLoading,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    load,
    setFilters,
    openCreateModal: () => {
      if (!canAccessAction('rnc', 'editar')) {
        setError('Seu perfil nao possui permissao para criar RNC.');
        return;
      }
      setSelected(null);
      setIsModalOpen(true);
    },
    openEditModal: (item: RncRegistro) => {
      if (!canAccessAction('rnc', 'editar')) {
        setError('Seu perfil nao possui permissao para editar RNC.');
        return;
      }
      if (item.status === 'concluido' || item.status === 'cancelado') {
        setError('RNC concluida ou cancelada nao pode ser editada por este fluxo.');
        return;
      }
      setSelected(item);
      setIsModalOpen(true);
    },
    closeModal: () => {
      setSelected(null);
      setIsModalOpen(false);
    },
    submitRnc,
  };
}
