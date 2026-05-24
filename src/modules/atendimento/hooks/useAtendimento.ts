import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { listarColaboradoresAtivos } from '../../colaboradores/services/colaboradores.service';
import { buscarDocumentoPorIdOuNumero } from '../../documentos/services/documentos.service';
import { tocarFeedbackLeitor } from '../../../lib/leitorFeedbackSonoro';
import { buscarMaterialPorLeituraCodigo } from '../../materiais/services/materiais.service';
import type { Material } from '../../materiais/types/material.types';
import {
  estornarAtendimento,
  listarDocumentosPendentesComMeta,
  listarHistoricoAtendimentosComMeta,
  montarExportacaoAtendimentosCsvItens,
  registrarAtendimento,
  registrarAtendimentosSessao,
} from '../services/atendimento.service';
import type { Colaborador } from '../../colaboradores/types/colaborador.types';
import type {
  Atendimento,
  AtendimentoDocumento,
  AtendimentoDocumentoLinha,
  AtendimentoItem,
  AtendimentoRecebedorTipo,
  DadosReciboAtendimento,
  DadosReciboEstorno,
  DadosReciboSessaoConsolidada,
  EstornoAtendimentoLinha,
  ReciboSessaoSecaoDocumento,
  SessaoRetiradaLinha,
} from '../types/atendimento.types';
import { imprimirReciboAtendimento, imprimirReciboSessaoConsolidada } from '../utils/imprimirReciboAtendimento';
import { imprimirReciboEstorno } from '../utils/imprimirReciboEstorno';
import { montarDadosReciboEstorno } from '../utils/montarDadosReciboEstorno';
import { montarDadosReciboSessaoConsolidada } from '../utils/montarDadosReciboSessaoConsolidada';
import {
  adicionarOuAtualizarLinhaSessao,
  montarPayloadDocumentosSessao,
  obterErroRegistroSessaoRetirada,
  removerLinhaSessao,
  totalUnidadesSessao,
} from '../utils/sessaoRetirada.utils';

type AtendimentoCorePayload = {
  documentos: AtendimentoDocumento[];
  historico: Atendimento[];
  colaboradores: Colaborador[];
  fallbackReason: string;
};

function atendimentoCoreQueryKey(userLogin: string | undefined) {
  return ['atendimento', 'core', userLogin ?? ''] as const;
}

/**
 * Valida documento, cabecalho (atendente + retirante conforme o tipo) e itens com quantidades.
 * Retorna mensagem de erro ou null se estiver pronto para registrar. Nao verifica permissao de edicao.
 */
export function obterErroRegistroAtendimento(
  selectedDocumento: AtendimentoDocumento | null,
  atendente: string,
  recebedorTipo: AtendimentoRecebedorTipo,
  recebedorColaboradorId: string,
  recebedor: string,
  recebedorEmpresa: string,
  recebedorDocumento: string,
  recebedorTelefone: string,
  autorizadorInterno: string,
  motivoRetirada: string,
  itensSelecionados: AtendimentoDocumentoLinha[],
  idsMarcados: Set<string>,
): string | null {
  if (!selectedDocumento) {
    return 'Selecione um documento para atender.';
  }

  if (!atendente.trim()) {
    return 'Informe o atendente responsavel.';
  }

  const itens = itensSelecionados.map((linha) => ({
    documentoItemId: linha.documentoItemId,
    quantidade: linha.quantidadeNestaOperacao,
  }));

  if (!itens.length) {
    const haMarcadoSemQuantidade = selectedDocumento.linhas.some(
      (linha) => idsMarcados.has(linha.documentoItemId) && linha.quantidadeNestaOperacao <= 0,
    );
    return haMarcadoSemQuantidade
      ? 'Ha itens marcados, mas nenhuma quantidade valida nesta operacao. Verifique a coluna Saldo: se estiver 0, o material nao foi encontrado no cadastro ou nao ha estoque; ajuste em Materiais/Recebimentos. Informe uma quantidade maior que zero (ate o saldo e ao pendente).'
      : 'Marque ao menos um item e informe quantidade maior que zero para registrar o atendimento.';
  }

  const duplicateDocumentoItemIds = new Set<string>();
  for (const item of itens) {
    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      return 'As quantidades informadas precisam ser numericas e maiores que zero.';
    }
    if (duplicateDocumentoItemIds.has(item.documentoItemId)) {
      return 'Nao e permitido repetir o mesmo item do documento na mesma operacao.';
    }
    duplicateDocumentoItemIds.add(item.documentoItemId);
  }

  const hasInvalidQuantity = selectedDocumento.linhas.some(
    (linha) =>
      idsMarcados.has(linha.documentoItemId) &&
      (linha.quantidadeNestaOperacao < 0 ||
        linha.quantidadeNestaOperacao > linha.quantidadePendente ||
        linha.quantidadeNestaOperacao > linha.saldoDisponivel),
  );
  if (hasInvalidQuantity) {
    return 'As quantidades desta operacao nao podem exceder o saldo disponivel nem o pendente do documento.';
  }

  if (recebedorTipo === 'interno' && !recebedorColaboradorId) {
    return 'Selecione o colaborador interno que esta retirando o material.';
  }

  if (recebedorTipo === 'externo') {
    if (
      !recebedor.trim() ||
      !recebedorEmpresa.trim() ||
      !recebedorDocumento.trim() ||
      !autorizadorInterno.trim() ||
      !motivoRetirada.trim()
    ) {
      return 'Preencha nome, empresa, documento, autorizador interno e motivo para retirante externo.';
    }
    if (recebedorTelefone.replace(/\D/g, '').length < 8) {
      return 'Informe um telefone valido para o retirante externo.';
    }
  }

  return null;
}

/** Sugestao ao marcar linha / todos: ate o pendente do documento, limitado ao saldo disponivel. */
export function quantidadeMaximaAtendimentoLinha(linha: AtendimentoDocumentoLinha): number {
  const pendente = Number(linha.quantidadePendente) || 0;
  const saldo = Number(linha.saldoDisponivel) || 0;
  return Math.max(0, Math.min(pendente, saldo));
}

function quantidadeSugeridaNestaOperacao(linha: AtendimentoDocumentoLinha): number {
  return quantidadeMaximaAtendimentoLinha(linha);
}

export type AtendimentoLeitorCandidato = {
  documento: AtendimentoDocumento;
  linha: AtendimentoDocumentoLinha;
};

export type AtendimentoLeitorPainelState = {
  scan: string;
  material: Material;
  candidatos: AtendimentoLeitorCandidato[];
  documentoSelecionadoId?: string;
  passo?: 'escolher' | 'concluido';
  quantidadeAplicada?: number;
};

/**
 * Sincronização em segundo plano (nuvem): atualiza pendência/saldo vindos do servidor sem apagar
 * quantidades já digitadas nesta operação.
 */
function mergeDocumentosPendentesPreservandoOperacao(
  prev: AtendimentoDocumento[],
  next: AtendimentoDocumento[],
): AtendimentoDocumento[] {
  const prevById = new Map(prev.map((d) => [d.id, d]));
  return next.map((doc) => {
    const prevDoc = prevById.get(doc.id);
    if (!prevDoc) return doc;
    const prevLinha = new Map(prevDoc.linhas.map((l) => [l.documentoItemId, l]));
    return {
      ...doc,
      linhas: doc.linhas.map((linha) => {
        const pl = prevLinha.get(linha.documentoItemId);
        if (!pl) return linha;
        const cap = quantidadeSugeridaNestaOperacao(linha);
        const q = Math.min(pl.quantidadeNestaOperacao, cap);
        return { ...linha, quantidadeNestaOperacao: Math.max(0, q) };
      }),
    };
  });
}

export function useAtendimento() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();

  function baixarBlobCsv(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportarAtendimentosMateriaisExcel() {
    if (!canAccessAction('atendimento', 'visualizar')) {
      setError('Seu perfil nao possui permissao para exportar o relatorio de atendimentos.');
      return;
    }
    setError('');
    setSuccess('');
    const result = await montarExportacaoAtendimentosCsvItens();
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar o arquivo.');
      return;
    }
    baixarBlobCsv(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }), result.data.fileName);
    setSuccess('Exportacao Excel (CSV) concluida — uma linha por material, com lote, documento e rastreio para estorno.');
  }
  const hasCloudConfig = hasSupabaseConfig();
  const [documentos, setDocumentos] = useState<AtendimentoDocumento[]>([]);
  const [historico, setHistorico] = useState<Atendimento[]>([]);
  const [selectedDocumentoId, setSelectedDocumentoId] = useState('');
  const [atendente, setAtendente] = useState('');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [recebedorTipo, setRecebedorTipo] = useState<AtendimentoRecebedorTipo>('interno');
  const [recebedorColaboradorId, setRecebedorColaboradorId] = useState('');
  const [recebedor, setRecebedor] = useState('');
  const [recebedorEmpresa, setRecebedorEmpresa] = useState('');
  const [recebedorDocumento, setRecebedorDocumento] = useState('');
  const [recebedorTelefone, setRecebedorTelefone] = useState('');
  const [autorizadorInterno, setAutorizadorInterno] = useState('');
  const [motivoRetirada, setMotivoRetirada] = useState('');
  const [manualReplaceLoading, setManualReplaceLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [fallbackReason, setFallbackReason] = useState('');
  /** Itens marcados para esta operacao (checkbox). Ao trocar de documento, todos comecam marcados. */
  const [idsMarcados, setIdsMarcados] = useState<Set<string>>(new Set());
  /**
   * Evita sobrescrever quantidades ao digitar (documentos muda a cada tecla).
   * Reseta em load() para reaplicar sugestao apos o servidor devolver lista nova.
   */
  const ultimoDocumentoComSugestaoAplicadaRef = useRef<string>('');
  /**
   * Incrementa somente quando a lista de documentos e recarregada (load), nao em updateLinha.
   * Permite reaplicar sugestao quando o servidor devolve dados sem depender de `documentos` no efeito.
   */
  const [documentosListaTick, setDocumentosListaTick] = useState(0);
  /** Leitor de codigo: ao abrir documento por bip, marcar apenas a linha lida (nao todas). */
  const leitorAplicarSomenteLinhaRef = useRef<{
    documentoId: string;
    documentoItemId: string;
    quantidade?: number;
  } | null>(null);
  /** Leitor USB: modal com desenho, quantidade e continuar bipando. */
  const [leitorPainel, setLeitorPainel] = useState<AtendimentoLeitorPainelState | null>(null);
  /** Fila multi-desenho antes de confirmar retirada unica + recibo consolidado. */
  const [sessaoRetirada, setSessaoRetirada] = useState<SessaoRetiradaLinha[]>([]);
  /** Confirmacao da sessao multi-desenho. */
  const [confirmacaoSessaoRetirada, setConfirmacaoSessaoRetirada] = useState<{
    documentoCount: number;
    itemCount: number;
    totalUnidades: number;
  } | null>(null);
  /** Recibo consolidado apos confirmar sessao. */
  const [reciboSessaoOpcional, setReciboSessaoOpcional] = useState<DadosReciboSessaoConsolidada | null>(null);
  /** Confirmacao no padrao do sistema (Modal), substitui window.confirm. */
  const [confirmacaoAtendimento, setConfirmacaoAtendimento] = useState<{
    documentoNumero: string;
    itemCount: number;
    totalUnidades: number;
  } | null>(null);
  /** Apos sucesso: oferecer impressao do recibo. */
  const [reciboOpcional, setReciboOpcional] = useState<DadosReciboAtendimento | null>(null);
  /** Apos estorno confirmado: oferecer impressao do recibo de estorno. */
  const [reciboEstornoOpcional, setReciboEstornoOpcional] = useState<DadosReciboEstorno | null>(null);

  /** Modal de estorno: dados do documento + campos obrigatorios + recibo de estorno. */
  const [estornoAlvo, setEstornoAlvo] = useState<Atendimento | null>(null);
  const [estornoDocLoading, setEstornoDocLoading] = useState(false);
  const [estornoDocInfo, setEstornoDocInfo] = useState<{
    descricao: string;
    revisao: string;
    responsavel: string;
  } | null>(null);
  const [estornoNomeQuemEstorna, setEstornoNomeQuemEstorna] = useState('');
  const [estornoNomeQuemDevolve, setEstornoNomeQuemDevolve] = useState('');
  const [estornoMotivo, setEstornoMotivo] = useState('');
  /** Por item do lote: incluido no estorno e quantidade a devolver (<= ao registrado no lote). */
  const [estornoLinhas, setEstornoLinhas] = useState<Record<string, { marcado: boolean; quantidade: number }>>({});

  /**
   * `initial` → primeira aplicação após fetch (replace).
   * `replace` → invalidação explícita / load() sem silent (substitui lista e reseta sugestões).
   * `merge` → refetch em segundo plano (foco, intervalo, refetch silencioso): preserva quantidades digitadas.
   */
  const nextApplyRef = useRef<'initial' | 'replace' | 'merge'>('initial');
  const lastAppliedDataUpdatedAtRef = useRef<number>(0);

  const listQuery = useQuery({
    queryKey: atendimentoCoreQueryKey(user?.login),
    placeholderData: keepPreviousData,
    /** Foco/visibilidade: efeito dedicado com debounce 350ms (evita refetch em rajada). */
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (!hasCloudConfig) return false;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      return 30_000;
    },
    queryFn: async (): Promise<AtendimentoCorePayload> => {
      const [docsResult, histResult, colaboradoresAtivos] = await Promise.all([
        listarDocumentosPendentesComMeta(),
        listarHistoricoAtendimentosComMeta(),
        listarColaboradoresAtivos(),
      ]);
      if (!docsResult.success || !histResult.success) {
        throw new Error(
          docsResult.error ?? histResult.error ?? 'Nao foi possivel carregar os dados de atendimento.',
        );
      }
      return {
        documentos: docsResult.data ?? [],
        historico: histResult.data ?? [],
        colaboradores: colaboradoresAtivos,
        fallbackReason: docsResult.meta?.fallbackReason ?? histResult.meta?.fallbackReason ?? '',
      };
    },
  });

  /** Volta ao separador / janela: alinha pendências (merge), com debounce como no fluxo anterior ao React Query. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let debounce: number | null = null;
    const schedule = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        if (document.visibilityState !== 'visible') return;
        nextApplyRef.current = 'merge';
        void queryClient.refetchQueries({ queryKey: ['atendimento', 'core'] });
      }, 350);
    };
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('focus', schedule);
    return () => {
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('focus', schedule);
      if (debounce) window.clearTimeout(debounce);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!listQuery.data) return;
    if (listQuery.dataUpdatedAt === lastAppliedDataUpdatedAtRef.current) return;
    lastAppliedDataUpdatedAtRef.current = listQuery.dataUpdatedAt;

    const payload = listQuery.data;
    let mode: 'replace' | 'merge';
    if (nextApplyRef.current === 'initial') {
      mode = 'replace';
      nextApplyRef.current = 'merge';
    } else if (nextApplyRef.current === 'replace') {
      mode = 'replace';
      nextApplyRef.current = 'merge';
    } else {
      mode = 'merge';
    }

    setSnapshotConflict(false);
    if (mode === 'merge') {
      setDocumentos((prev) => mergeDocumentosPendentesPreservandoOperacao(prev, payload.documentos));
    } else {
      setDocumentos(payload.documentos);
      setDocumentosListaTick((n) => n + 1);
      ultimoDocumentoComSugestaoAplicadaRef.current = '';
    }
    setHistorico(payload.historico);
    setColaboradores(payload.colaboradores);
    setFallbackReason(payload.fallbackReason);
  }, [listQuery.data, listQuery.dataUpdatedAt]);

  const invalidateAtendimentoReplace = useCallback(async () => {
    nextApplyRef.current = 'replace';
    setError('');
    setManualReplaceLoading(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['atendimento', 'core'] });
    } finally {
      setManualReplaceLoading(false);
    }
  }, [queryClient]);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent === true) {
        nextApplyRef.current = 'merge';
        await listQuery.refetch();
        return;
      }
      await invalidateAtendimentoReplace();
    },
    [listQuery, invalidateAtendimentoReplace],
  );

  const loading = listQuery.isLoading || manualReplaceLoading;
  const listFetchError =
    listQuery.isError && !listQuery.data
      ? listQuery.error instanceof Error
        ? listQuery.error.message
        : 'Nao foi possivel carregar os dados de atendimento.'
      : '';

  const selectedDocumento = useMemo(
    () => documentos.find((documento) => documento.id === selectedDocumentoId) ?? null,
    [documentos, selectedDocumentoId],
  );

  useEffect(() => {
    if (!selectedDocumentoId) {
      setIdsMarcados(new Set());
      ultimoDocumentoComSugestaoAplicadaRef.current = '';
      return;
    }
    const doc = documentos.find((d) => d.id === selectedDocumentoId);
    if (!doc?.linhas.length) {
      return;
    }

    const somenteLeitor = leitorAplicarSomenteLinhaRef.current;
    if (somenteLeitor && somenteLeitor.documentoId === selectedDocumentoId) {
      leitorAplicarSomenteLinhaRef.current = null;
      ultimoDocumentoComSugestaoAplicadaRef.current = selectedDocumentoId;
      setIdsMarcados(new Set([somenteLeitor.documentoItemId]));
      setDocumentos((current) =>
        current.map((d) =>
          d.id !== selectedDocumentoId
            ? d
            : {
                ...d,
                linhas: d.linhas.map((linha) =>
                  linha.documentoItemId === somenteLeitor.documentoItemId
                    ? {
                        ...linha,
                        quantidadeNestaOperacao:
                          somenteLeitor.quantidade ?? quantidadeSugeridaNestaOperacao(linha),
                      }
                    : { ...linha, quantidadeNestaOperacao: 0 },
                ),
              },
        ),
      );
      return;
    }

    if (ultimoDocumentoComSugestaoAplicadaRef.current === selectedDocumentoId) {
      return;
    }
    ultimoDocumentoComSugestaoAplicadaRef.current = selectedDocumentoId;

    setIdsMarcados(new Set(doc.linhas.map((l) => l.documentoItemId)));
    setDocumentos((current) =>
      current.map((d) =>
        d.id !== selectedDocumentoId
          ? d
          : {
              ...d,
              linhas: d.linhas.map((linha) => ({
                ...linha,
                quantidadeNestaOperacao: quantidadeSugeridaNestaOperacao(linha),
              })),
            },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `documentos` omitido de proposito: incluir dispara o efeito a cada digito e apaga edicoes locais.
  }, [selectedDocumentoId, documentosListaTick]);

  const itensSelecionados = useMemo(
    () =>
      selectedDocumento?.linhas.filter(
        (linha) => idsMarcados.has(linha.documentoItemId) && linha.quantidadeNestaOperacao > 0,
      ) ?? [],
    [selectedDocumento, idsMarcados],
  );

  const podeRegistrarAtendimento = useMemo(
    () =>
      obterErroRegistroAtendimento(
        selectedDocumento,
        atendente,
        recebedorTipo,
        recebedorColaboradorId,
        recebedor,
        recebedorEmpresa,
        recebedorDocumento,
        recebedorTelefone,
        autorizadorInterno,
        motivoRetirada,
        itensSelecionados,
        idsMarcados,
      ) === null,
    [
      selectedDocumento,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
      itensSelecionados,
      idsMarcados,
    ],
  );

  const toggleMarcaItem = useCallback(
    (documentoItemId: string, marcado: boolean) => {
      setIdsMarcados((prev) => {
        const next = new Set(prev);
        if (marcado) next.add(documentoItemId);
        else next.delete(documentoItemId);
        return next;
      });
      setDocumentos((current) =>
        current.map((doc) => {
          if (doc.id !== selectedDocumentoId) return doc;
          return {
            ...doc,
            linhas: doc.linhas.map((linha) => {
              if (linha.documentoItemId !== documentoItemId) return linha;
              if (!marcado) return { ...linha, quantidadeNestaOperacao: 0 };
              return { ...linha, quantidadeNestaOperacao: quantidadeSugeridaNestaOperacao(linha) };
            }),
          };
        }),
      );
    },
    [selectedDocumentoId, setDocumentos],
  );

  function aplicarLinhaNoDocumento(
    documentoId: string,
    documentoItemId: string,
    quantidade: number,
  ) {
    setIdsMarcados((prev) => new Set([...prev, documentoItemId]));
    setDocumentos((current) =>
      current.map((doc) =>
        doc.id !== documentoId
          ? doc
          : {
              ...doc,
              linhas: doc.linhas.map((linha) =>
                linha.documentoItemId === documentoItemId
                  ? { ...linha, quantidadeNestaOperacao: quantidade }
                  : linha,
              ),
            },
      ),
    );
  }

  const confirmarLeitorComQuantidade = useCallback(
    (documentoId: string, quantidadeInformada: number) => {
      if (!leitorPainel) return;
      const cand = leitorPainel.candidatos.find((c) => c.documento.id === documentoId);
      if (!cand) return;
      const { documento, linha } = cand;
      const max = quantidadeMaximaAtendimentoLinha(linha);
      const q = Math.min(Math.max(0, quantidadeInformada), max);
      if (q <= 0) {
        tocarFeedbackLeitor('erro');
        setError('Informe quantidade maior que zero (respeitando pendente e saldo).');
        return;
      }
      setError('');

      aplicarLinhaNoDocumento(documentoId, linha.documentoItemId, q);
      setSessaoRetirada((prev) =>
        adicionarOuAtualizarLinhaSessao(
          prev,
          {
            documentoId: documento.id,
            documentoNumero: documento.numero,
            documentoRevisao: documento.revisao,
            documentoDescricao: documento.descricao,
            documentoResponsavel: documento.responsavel,
            documentoItemId: linha.documentoItemId,
            codigoMaterial: linha.codigoMaterial,
            descricaoMaterial: linha.descricaoMaterial,
            unidade: linha.unidade,
            quantidade: q,
          },
          max,
        ),
      );

      setLeitorPainel((prev) =>
        prev
          ? {
              ...prev,
              passo: 'concluido',
              documentoSelecionadoId: documentoId,
              quantidadeAplicada: q,
            }
          : prev,
      );
      setSuccess(
        `${leitorPainel.material.codigo} incluido na sessao (${q} ${linha.unidade}) — ${documento.numero} Rev. ${documento.revisao}.`,
      );
      tocarFeedbackLeitor('confirmado');
    },
    [leitorPainel],
  );

  const removerLinhaSessaoRetirada = useCallback((documentoId: string, documentoItemId: string) => {
    setSessaoRetirada((prev) => removerLinhaSessao(prev, documentoId, documentoItemId));
    setDocumentos((current) =>
      current.map((doc) =>
        doc.id !== documentoId
          ? doc
          : {
              ...doc,
              linhas: doc.linhas.map((linha) =>
                linha.documentoItemId === documentoItemId ? { ...linha, quantidadeNestaOperacao: 0 } : linha,
              ),
            },
      ),
    );
  }, [setDocumentos]);

  const limparSessaoRetirada = useCallback(() => {
    setSessaoRetirada([]);
    setDocumentos((current) =>
      current.map((doc) => ({
        ...doc,
        linhas: doc.linhas.map((linha) => ({ ...linha, quantidadeNestaOperacao: 0 })),
      })),
    );
    setIdsMarcados(new Set());
  }, [setDocumentos]);

  const podeConfirmarSessaoRetirada = useMemo(
    () =>
      obterErroRegistroSessaoRetirada(
        sessaoRetirada,
        documentos,
        atendente,
        recebedorTipo,
        recebedorColaboradorId,
        recebedor,
        recebedorEmpresa,
        recebedorDocumento,
        recebedorTelefone,
        autorizadorInterno,
        motivoRetirada,
      ) === null,
    [
      sessaoRetirada,
      documentos,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
    ],
  );

  function pedirConfirmacaoSessaoRetirada() {
    setError('');
    setSuccess('');
    setSnapshotConflict(false);
    if (!canAccessAction('atendimento', 'editar')) {
      setError('Seu perfil nao possui permissao para registrar atendimento.');
      return;
    }
    const erro = obterErroRegistroSessaoRetirada(
      sessaoRetirada,
      documentos,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
    );
    if (erro) {
      setError(erro);
      return;
    }
    const docs = new Set(sessaoRetirada.map((l) => l.documentoId));
    setConfirmacaoSessaoRetirada({
      documentoCount: docs.size,
      itemCount: sessaoRetirada.length,
      totalUnidades: totalUnidadesSessao(sessaoRetirada),
    });
  }

  function cancelarConfirmacaoSessaoRetirada() {
    setConfirmacaoSessaoRetirada(null);
  }

  async function confirmarSessaoRetiradaNoModal() {
    if (!confirmacaoSessaoRetirada) return;
    const erro = obterErroRegistroSessaoRetirada(
      sessaoRetirada,
      documentos,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
    );
    if (erro) {
      setError(erro);
      setConfirmacaoSessaoRetirada(null);
      return;
    }

    const metaPorDocumento = new Map<
      string,
      { descricao: string; revisao: string; responsavel: string; numero: string }
    >();
    for (const linha of sessaoRetirada) {
      if (!metaPorDocumento.has(linha.documentoId)) {
        metaPorDocumento.set(linha.documentoId, {
          descricao: linha.documentoDescricao,
          revisao: linha.documentoRevisao,
          responsavel: linha.documentoResponsavel,
          numero: linha.documentoNumero,
        });
      }
    }

    const tipoRec = recebedorTipo;
    const colabId = recebedorColaboradorId;
    const extNome = recebedor;
    const extEmp = recebedorEmpresa;
    const extDoc = recebedorDocumento;
    const extTel = recebedorTelefone;
    const extAuth = autorizadorInterno;
    const extMotivo = motivoRetirada;

    setConfirmacaoSessaoRetirada(null);

    const result = await registrarAtendimentosSessao({
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
      documentos: montarPayloadDocumentosSessao(sessaoRetirada),
    });

    if (!result.success || !result.data?.length) {
      setError(result.error ?? 'Nao foi possivel registrar a sessao de retirada.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
      return;
    }

    const nomeColabRetirada =
      tipoRec === 'interno' && colabId
        ? colaboradores.find((c) => c.id === colabId)?.nome?.trim() ?? ''
        : '';
    const nomeAtendido =
      tipoRec === 'interno'
        ? nomeColabRetirada || '-'
        : `${extNome.trim()}${extEmp.trim() ? ` — ${extEmp.trim()}` : ''}`.trim() || '-';

    const secoes: ReciboSessaoSecaoDocumento[] = result.data.map((at) => {
      const meta = metaPorDocumento.get(at.documentoId);
      return {
        atendimento: at,
        documentoDescricao: meta?.descricao ?? '',
        documentoRevisao: meta?.revisao ?? '—',
        documentoResponsavel: meta?.responsavel ?? '—',
      };
    });

    const numeros = result.data.map((a) => a.numero).join(', ');
    setSnapshotConflict(false);
    setSuccess(
      result.meta?.source === 'local'
        ? `Retirada registrada (${result.data.length} lote(s): ${numeros}).`
        : `Retirada registrada com sucesso (${result.data.length} lote(s): ${numeros}).`,
    );

    setSessaoRetirada([]);
    setRecebedorTipo('interno');
    setRecebedorColaboradorId('');
    setRecebedor('');
    setRecebedorEmpresa('');
    setRecebedorDocumento('');
    setRecebedorTelefone('');
    setAutorizadorInterno('');
    setMotivoRetirada('');
    setSelectedDocumentoId('');
    setIdsMarcados(new Set());
    await load();

    setReciboSessaoOpcional(
      montarDadosReciboSessaoConsolidada(
        result.data,
        secoes,
        nomeAtendido,
        tipoRec === 'externo'
          ? {
              documentoIdentificacao: extDoc.trim(),
              telefone: extTel.trim(),
              autorizadorInterno: extAuth.trim(),
              motivoRetirada: extMotivo.trim(),
            }
          : undefined,
      ),
    );
  }

  function dispensarImpressaoReciboSessao() {
    setReciboSessaoOpcional(null);
  }

  function imprimirReciboSessaoEfechar() {
    if (reciboSessaoOpcional) {
      const ok = imprimirReciboSessaoConsolidada(reciboSessaoOpcional);
      if (!ok) {
        setError(
          'Nao foi possivel abrir a janela do recibo. Desative o bloqueador de popups para este site e tente de novo.',
        );
      }
    }
    setReciboSessaoOpcional(null);
  }

  const continuarLeitorBipando = useCallback(() => {
    setLeitorPainel(null);
  }, []);

  const processarLeituraCodigoBarras = useCallback(
    async (scanRaw: string) => {
      const scan = scanRaw.trim();
      if (!scan) return;
      if (!canAccessAction('atendimento', 'editar')) {
        setError('Seu perfil nao possui permissao para registrar atendimento.');
        return;
      }
      setError('');
      setSuccess('');

      const matRes = await buscarMaterialPorLeituraCodigo(scan);
      if (!matRes.success) {
        tocarFeedbackLeitor('erro');
        setError(matRes.error ?? 'Falha ao buscar material.');
        return;
      }
      if (!matRes.data) {
        tocarFeedbackLeitor('erro');
        setError('Material nao encontrado no cadastro (codigo ou codigo de barras).');
        return;
      }
      const material = matRes.data;
      const codigoRef = material.codigo.trim().toLowerCase();

      const candidatos = documentos.flatMap((d) => {
        const linha = d.linhas.find((l) => l.codigoMaterial.trim().toLowerCase() === codigoRef);
        return linha ? [{ documento: d, linha }] : [];
      });

      setLeitorPainel({ scan, material, candidatos, passo: 'escolher' });

      if (candidatos.length === 0) {
        tocarFeedbackLeitor('erro');
        setError(
          'Nenhum documento pendente inclui este material. E necessario cadastro, recebimento (saldo) e linha no documento.',
        );
      } else {
        tocarFeedbackLeitor('sucesso');
      }
    },
    [documentos, canAccessAction],
  );

  const fecharLeitorPainel = useCallback(() => {
    setLeitorPainel(null);
  }, []);

  const marcarTodosItens = useCallback(
    (marcado: boolean) => {
      setDocumentos((current) => {
        const doc = current.find((d) => d.id === selectedDocumentoId);
        if (!doc) return current;
        if (!marcado) {
          queueMicrotask(() => setIdsMarcados(new Set()));
          return current.map((d) =>
            d.id !== selectedDocumentoId
              ? d
              : { ...d, linhas: d.linhas.map((l) => ({ ...l, quantidadeNestaOperacao: 0 })) },
          );
        }
        queueMicrotask(() => setIdsMarcados(new Set(doc.linhas.map((l) => l.documentoItemId))));
        return current.map((d) =>
          d.id !== selectedDocumentoId
            ? d
            : {
                ...d,
                linhas: doc.linhas.map((linha) => ({
                  ...linha,
                  quantidadeNestaOperacao: quantidadeSugeridaNestaOperacao(linha),
                })),
              },
        );
      });
    },
    [selectedDocumentoId, setDocumentos],
  );

  function updateLinha(lineId: string, quantidadeNestaOperacao: number) {
    setDocumentos((current) =>
      current.map((doc) =>
        doc.id !== selectedDocumentoId
          ? doc
          : {
              ...doc,
              linhas: doc.linhas.map((linha) =>
                linha.documentoItemId === lineId ? { ...linha, quantidadeNestaOperacao } : linha,
              ),
            },
      ),
    );
  }

  /** Valida e abre o modal de confirmacao (padrao do sistema). */
  function pedirConfirmacaoAtendimento() {
    setError('');
    setSuccess('');
    setSnapshotConflict(false);

    if (!canAccessAction('atendimento', 'editar')) {
      setError('Seu perfil nao possui permissao para registrar atendimento.');
      return;
    }

    const erroForm = obterErroRegistroAtendimento(
      selectedDocumento,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
      itensSelecionados,
      idsMarcados,
    );
    if (erroForm) {
      setError(erroForm);
      return;
    }

    if (!selectedDocumento) return;

    const itens = itensSelecionados.map((linha) => ({
      documentoItemId: linha.documentoItemId,
      quantidade: linha.quantidadeNestaOperacao,
    }));

    setConfirmacaoAtendimento({
      documentoNumero: selectedDocumento.numero,
      itemCount: itens.length,
      totalUnidades: totalizarLinhas(itensSelecionados),
    });
  }

  function cancelarConfirmacaoAtendimento() {
    setConfirmacaoAtendimento(null);
  }

  async function confirmarAtendimentoNoModal() {
    if (!selectedDocumento || !confirmacaoAtendimento) return;

    const erroForm = obterErroRegistroAtendimento(
      selectedDocumento,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
      itensSelecionados,
      idsMarcados,
    );
    if (erroForm) {
      setError(erroForm);
      setConfirmacaoAtendimento(null);
      return;
    }

    const itens = itensSelecionados.map((linha) => ({
      documentoItemId: linha.documentoItemId,
      quantidade: linha.quantidadeNestaOperacao,
    }));

    setConfirmacaoAtendimento(null);

    const result = await registrarAtendimento({
      documentoId: selectedDocumento.id,
      atendente,
      recebedorTipo,
      recebedorColaboradorId,
      recebedor,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
      itens,
    });

    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel registrar o atendimento.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
      return;
    }

    const docSnapshot = selectedDocumento;
    const tipoRec = recebedorTipo;
    const colabId = recebedorColaboradorId;
    const extNome = recebedor;
    const extEmp = recebedorEmpresa;
    const extDoc = recebedorDocumento;
    const extTel = recebedorTelefone;
    const extAuth = autorizadorInterno;
    const extMotivo = motivoRetirada;

    const nomeColabRetirada =
      tipoRec === 'interno' && colabId
        ? colaboradores.find((c) => c.id === colabId)?.nome?.trim() ?? ''
        : '';
    const nomeAtendido =
      tipoRec === 'interno'
        ? nomeColabRetirada || '-'
        : `${extNome.trim()}${extEmp.trim() ? ` — ${extEmp.trim()}` : ''}`.trim() || '-';

    setSnapshotConflict(false);
    setSuccess(
      result.meta?.source === 'local'
        ? `Atendimento ${result.data?.numero ?? ''} registrado localmente.`
        : `Atendimento ${result.data?.numero ?? ''} registrado com sucesso.`,
    );
    setRecebedorTipo('interno');
    setRecebedorColaboradorId('');
    setRecebedor('');
    setRecebedorEmpresa('');
    setRecebedorDocumento('');
    setRecebedorTelefone('');
    setAutorizadorInterno('');
    setMotivoRetirada('');
    await load();
    setSelectedDocumentoId('');
    if (result.data && docSnapshot) {
      setReciboOpcional({
        atendimento: result.data,
        documentoDescricao: docSnapshot.descricao,
        documentoRevisao: docSnapshot.revisao,
        documentoResponsavel: docSnapshot.responsavel,
        nomeAtendido,
        detalhesRetiradaExterna:
          tipoRec === 'externo'
            ? {
                documentoIdentificacao: extDoc.trim(),
                telefone: extTel.trim(),
                autorizadorInterno: extAuth.trim(),
                motivoRetirada: extMotivo.trim(),
              }
            : undefined,
      });
    }
  }

  function dispensarImpressaoRecibo() {
    setReciboOpcional(null);
  }

  function imprimirReciboEfechar() {
    if (reciboOpcional) {
      const ok = imprimirReciboAtendimento(reciboOpcional);
      if (!ok) {
        setError(
          'Nao foi possivel abrir a janela do recibo. Desative o bloqueador de popups para este site e tente de novo.',
        );
      }
    }
    setReciboOpcional(null);
  }

  function submitAtendimento() {
    pedirConfirmacaoAtendimento();
  }

  function fecharModalEstorno() {
    setError('');
    setEstornoAlvo(null);
    setEstornoDocInfo(null);
    setEstornoDocLoading(false);
    setEstornoNomeQuemEstorna('');
    setEstornoNomeQuemDevolve('');
    setEstornoMotivo('');
    setEstornoLinhas({});
  }

  function montarLinhasEstornoRequest(): EstornoAtendimentoLinha[] {
    if (!estornoAlvo) return [];
    const out: EstornoAtendimentoLinha[] = [];
    for (const it of estornoAlvo.itens) {
      const cfg = estornoLinhas[it.id];
      if (!cfg?.marcado) continue;
      const raw = Number(cfg.quantidade);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const q = Math.min(raw, it.quantidadeAtendida);
      if (q <= 0) continue;
      out.push({ atendimentoItemId: it.id, quantidade: q });
    }
    return out;
  }

  function indicarEstornoParcial(linhas: EstornoAtendimentoLinha[]): boolean {
    if (!estornoAlvo) return false;
    const porId = new Map<string, number>();
    for (const l of linhas) {
      porId.set(l.atendimentoItemId, (porId.get(l.atendimentoItemId) ?? 0) + l.quantidade);
    }
    for (const it of estornoAlvo.itens) {
      const q = porId.get(it.id) ?? 0;
      if (q < it.quantidadeAtendida) return true;
    }
    return false;
  }

  function montarItensReciboEstorno(linhas: EstornoAtendimentoLinha[]): AtendimentoItem[] {
    if (!estornoAlvo) return [];
    const out: AtendimentoItem[] = [];
    for (const lin of linhas) {
      const item = estornoAlvo.itens.find((i) => i.id === lin.atendimentoItemId);
      if (item) out.push({ ...item, quantidadeAtendida: lin.quantidade });
    }
    return out;
  }

  function validarCamposEstorno(): boolean {
    if (!estornoNomeQuemEstorna.trim() || !estornoNomeQuemDevolve.trim() || !estornoMotivo.trim()) {
      setError('Preencha quem esta estornando, quem esta devolvendo e o motivo do estorno.');
      return false;
    }
    if (montarLinhasEstornoRequest().length === 0) {
      setError('Selecione ao menos um material com quantidade valida para estornar.');
      return false;
    }
    return true;
  }

  function dispensarImpressaoReciboEstorno() {
    setReciboEstornoOpcional(null);
  }

  function imprimirReciboEstornoEfechar() {
    if (reciboEstornoOpcional) {
      const ok = imprimirReciboEstorno(reciboEstornoOpcional);
      if (!ok) {
        setError('Nao foi possivel abrir a janela do recibo de estorno. Desative o bloqueador de popups.');
      }
    }
    setReciboEstornoOpcional(null);
  }

  async function iniciarEstorno(item: Atendimento) {
    setError('');
    setSuccess('');
    setSnapshotConflict(false);
    if (!canAccessAction('atendimento', 'administrar')) {
      setError('Seu perfil nao possui permissao para estornar atendimento.');
      return;
    }
    setEstornoAlvo(item);
    setEstornoDocInfo(null);
    setEstornoNomeQuemEstorna('');
    setEstornoNomeQuemDevolve('');
    setEstornoMotivo('');
    setEstornoLinhas(
      Object.fromEntries(item.itens.map((it) => [it.id, { marcado: true, quantidade: it.quantidadeAtendida }])),
    );
    setEstornoDocLoading(true);
    const docResult = await buscarDocumentoPorIdOuNumero(item.documentoId, item.documentoNumero);
    const doc = docResult.success && docResult.data ? docResult.data : null;
    setEstornoDocInfo({
      descricao: doc?.descricao ?? '(Documento nao encontrado ou indisponivel.)',
      revisao: doc?.revisao ?? '—',
      responsavel: doc?.responsavel ?? '—',
    });
    setEstornoDocLoading(false);
  }

  async function executarImpressaoReciboEstorno() {
    if (!estornoAlvo) return;
    setError('');
    if (!validarCamposEstorno()) return;
    const linhas = montarLinhasEstornoRequest();
    try {
      const itensRecibo = montarItensReciboEstorno(linhas);
      const parcial = indicarEstornoParcial(linhas);
      const dados = await montarDadosReciboEstorno(
        estornoAlvo,
        {
          nomeQuemEstorna: estornoNomeQuemEstorna,
          nomeQuemDevolve: estornoNomeQuemDevolve,
          motivoEstorno: estornoMotivo,
        },
        itensRecibo,
        parcial,
      );
      if (!imprimirReciboEstorno(dados)) {
        setError('Nao foi possivel abrir a janela de impressao. Desative o bloqueador de popups.');
      }
    } catch {
      setError('Nao foi possivel montar o recibo de estorno.');
    }
  }

  async function confirmarEstornoFinal() {
    if (!estornoAlvo) return;
    setError('');
    if (!validarCamposEstorno()) return;
    const linhas = montarLinhasEstornoRequest();
    let dadosRecibo: DadosReciboEstorno;
    try {
      dadosRecibo = await montarDadosReciboEstorno(
        estornoAlvo,
        {
          nomeQuemEstorna: estornoNomeQuemEstorna,
          nomeQuemDevolve: estornoNomeQuemDevolve,
          motivoEstorno: estornoMotivo,
        },
        montarItensReciboEstorno(linhas),
        indicarEstornoParcial(linhas),
      );
    } catch {
      setError('Nao foi possivel montar o recibo de estorno.');
      return;
    }

    setSnapshotConflict(false);
    const numero = estornoAlvo.numero;
    const result = await estornarAtendimento(estornoAlvo.id, linhas);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel estornar o atendimento.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
      return;
    }

    fecharModalEstorno();
    const loteEncerrado = !result.data?.itens?.length;
    setSuccess(
      loteEncerrado
        ? result.meta?.source === 'local'
          ? `Atendimento ${numero} estornado localmente (lote encerrado).`
          : `Atendimento ${numero} estornado com sucesso (lote encerrado).`
        : result.meta?.source === 'local'
          ? `Estorno parcial registrado no atendimento ${numero} (material restante no lote).`
          : `Estorno parcial registrado no atendimento ${numero} (material restante no lote).`,
    );
    await load();
    setReciboEstornoOpcional(dadosRecibo);
  }

  return {
    documentos,
    historico,
    colaboradores,
    selectedDocumento,
    itensSelecionados,
    selectedDocumentoId,
    atendente,
    recebedorTipo,
    recebedorColaboradorId,
    recebedor,
    recebedorEmpresa,
    recebedorDocumento,
    recebedorTelefone,
    autorizadorInterno,
    motivoRetirada,
    loading,
    error: error || listFetchError,
    success,
    snapshotConflict,
    fallbackReason,
    hasCloudConfig,
    load,
    setSelectedDocumentoId,
    setAtendente,
    setRecebedorTipo,
    setRecebedorColaboradorId,
    setRecebedor,
    setRecebedorEmpresa,
    setRecebedorDocumento,
    setRecebedorTelefone,
    setAutorizadorInterno,
    setMotivoRetirada,
    updateLinha,
    submitAtendimento,
    pedirConfirmacaoAtendimento,
    podeRegistrarAtendimento,
    confirmacaoAtendimento,
    cancelarConfirmacaoAtendimento,
    confirmarAtendimentoNoModal,
    reciboOpcional,
    dispensarImpressaoRecibo,
    imprimirReciboEfechar,
    reciboEstornoOpcional,
    dispensarImpressaoReciboEstorno,
    imprimirReciboEstornoEfechar,
    estornoAlvo,
    estornoDocLoading,
    estornoDocInfo,
    estornoNomeQuemEstorna,
    estornoNomeQuemDevolve,
    estornoMotivo,
    setEstornoNomeQuemEstorna,
    setEstornoNomeQuemDevolve,
    setEstornoMotivo,
    fecharModalEstorno,
    executarImpressaoReciboEstorno,
    confirmarEstornoFinal,
    iniciarEstorno,
    estornoLinhas,
    setEstornoLinhas,
    idsMarcados,
    toggleMarcaItem,
    marcarTodosItens,
    exportarAtendimentosMateriaisExcel,
    leitorPainel,
    processarLeituraCodigoBarras,
    confirmarLeitorComQuantidade,
    continuarLeitorBipando,
    fecharLeitorPainel,
    sessaoRetirada,
    removerLinhaSessaoRetirada,
    limparSessaoRetirada,
    podeConfirmarSessaoRetirada,
    pedirConfirmacaoSessaoRetirada,
    confirmacaoSessaoRetirada,
    cancelarConfirmacaoSessaoRetirada,
    confirmarSessaoRetiradaNoModal,
    reciboSessaoOpcional,
    dispensarImpressaoReciboSessao,
    imprimirReciboSessaoEfechar,
  };
}

export function totalizarLinhas(linhas: AtendimentoDocumentoLinha[]) {
  return linhas.reduce((total, linha) => total + linha.quantidadeNestaOperacao, 0);
}
