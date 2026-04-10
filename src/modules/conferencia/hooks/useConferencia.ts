import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { buscarConferenciaPorId, concluirConferencia, listarConferencias } from '../services/conferencia.service';
import type { Conferencia, ConferenciaFiltro, ConferenciaListItem } from '../types/conferencia.types';

const initialFilters: ConferenciaFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 6,
};

export function useConferencia() {
  const { canAccessAction } = useAuth();
  const hasCloudConfig = hasSupabaseConfig();
  const [filters, setFilters] = useState<ConferenciaFiltro>(initialFilters);
  const [items, setItems] = useState<ConferenciaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fallbackReason, setFallbackReason] = useState('');
  const [selected, setSelected] = useState<Conferencia | null>(null);
  const [snapshotConflict, setSnapshotConflict] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setSnapshotConflict(false);
    const result = await listarConferencias(filters);
    if (!result.success || !result.data) {
      setItems([]);
      setTotal(0);
      setError(result.error ?? 'Nao foi possivel carregar conferencias.');
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

  const totaisSelecionados = useMemo(() => {
    if (!selected) return { recebido: 0, conferido: 0 };
    return {
      recebido: selected.itens.reduce((total, item) => total + item.quantidadeRecebida, 0),
      conferido: selected.itens.reduce((total, item) => total + item.quantidadeConferida, 0),
    };
  }, [selected]);

  async function selectConferencia(id: string) {
    setSuccess('');
    setError('');
    setSnapshotConflict(false);
    if (!id) {
      setSelected(null);
      return;
    }
    const result = await buscarConferenciaPorId(id);
    if (!result.success || !result.data) {
      setSelected(null);
      setError(result.error ?? 'Nao foi possivel carregar a conferencia.');
      return;
    }
    if (result.data.status === 'conferido') {
      setError('Este recebimento ja esta totalmente conferido.');
      setSelected(null);
      return;
    }
    setSelected(result.data);
  }

  function updateQuantidade(itemId: string, quantidadeConferida: number) {
    setSelected((current) =>
      current
        ? {
            ...current,
            itens: current.itens.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    quantidadeConferida: Math.max(0, Math.min(item.quantidadeRecebida, Number.isFinite(quantidadeConferida) ? quantidadeConferida : 0)),
                  }
                : item,
            ),
          }
        : current,
    );
  }

  async function submitConferencia() {
    setSuccess('');
    setError('');

    if (!canAccessAction('conferencia', 'editar')) {
      setError('Seu perfil nao possui permissao para concluir conferencia.');
      return;
    }

    if (!selected) {
      setError('Selecione um recebimento para conferir.');
      return;
    }

    if (!selected.conferente.trim()) {
      setError('Informe o conferente responsavel antes de salvar.');
      return;
    }

    if (!selected.itens.length) {
      setError('Nao ha itens disponiveis para conferencia neste recebimento.');
      return;
    }

    const hasInvalidQuantity = selected.itens.some(
      (item) => item.quantidadeConferida < 0 || item.quantidadeConferida > item.quantidadeRecebida,
    );
    if (hasInvalidQuantity) {
      setError('As quantidades conferidas devem ficar entre zero e a quantidade recebida.');
      return;
    }

    const result = await concluirConferencia({
      id: selected.id,
      conferente: selected.conferente,
      observacoes: selected.observacoes,
      itens: selected.itens.map((item) => ({ id: item.id, quantidadeConferida: item.quantidadeConferida })),
    });

    if (!result.success || !result.data) {
      setSnapshotConflict(Boolean(result.meta?.snapshotConflict));
      setError(result.error ?? 'Nao foi possivel salvar a conferencia.');
      return;
    }

    setSnapshotConflict(false);
    setSelected(result.data);
    setSuccess(`Conferencia do recebimento ${result.data.notaFiscal || result.data.id} salva com sucesso.`);
    await load();
  }

  return {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    snapshotConflict,
    hasCloudConfig,
    filters,
    selected,
    totaisSelecionados,
    setFilters,
    selectConferencia,
    setSelected,
    updateQuantidade,
    submitConferencia,
    load,
  };
}
