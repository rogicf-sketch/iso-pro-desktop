import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { listarColaboradoresAtivos } from '../../colaboradores/services/colaboradores.service';
import { tocarFeedbackLeitor } from '../../../lib/leitorFeedbackSonoro';
import { buscarMaterialPorLeituraCodigo } from '../../materiais/services/materiais.service';
import type { Material } from '../../materiais/types/material.types';
import {
  buscarDocumentosPendentesPorCodigoMaterialNuvem,
  estornarAtendimento,
  listarDocumentosPendentesComMeta,
  listarHistoricoAtendimentosComMeta,
  montarExportacaoAtendimentosPacoteZip,
  registrarAtendimento,
  registrarAtendimentosSessao,
} from '../services/atendimento.service';
import { buildEstornoV2IdempotencyKey } from '../services/estornoAtendimentoV2';
import { captureOperationalEvent } from '../../../lib/errorReporting';
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
import { montarMetadadosDocumentoAtendimento } from '../utils/montarMetadadosDocumentoAtendimento';
import {
  encontrarOutrosLotesMesmoMaterialDocumento,
  type AvisoLoteDuplicadoMaterial,
} from '../utils/lotesDuplicadosMaterial.utils';
import { montarDadosReciboSessaoConsolidada } from '../utils/montarDadosReciboSessaoConsolidada';
import { useRegistrarAtendimentoOperacaoGuard } from '../context/atendimentoOperacaoGuard.hooks';
import {
  adicionarOuAtualizarLinhaSessao,
  montarPayloadDocumentosSessao,
  obterErroRegistroSessaoRetirada,
  obterQuantidadeLinhaSessao,
  quantidadeMaximaLinhaDocumento,
  quantidadeMaximaRestanteLeitor,
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
/**
 * O refetch traz so os primeiros pendentes do boot. Documentos trazidos pelo leitor/busca remota
 * que estao na sessao de retirada (ou abertos no painel do leitor) nao podem sumir da lista,
 * senao a validacao da sessao falha («item nao encontrado») e o Confirmar retirada bloqueia.
 */
export function reterDocumentosProtegidos(
  prev: AtendimentoDocumento[],
  base: AtendimentoDocumento[],
  protegidos: ReadonlySet<string>,
): AtendimentoDocumento[] {
  if (!protegidos.size) return base;
  const idsBase = new Set(base.map((d) => d.id));
  const faltantes = prev.filter((d) => protegidos.has(d.id) && !idsBase.has(d.id));
  return faltantes.length ? [...base, ...faltantes] : base;
}

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

  async function exportarAtendimentosMateriaisExcel() {
    if (!canAccessAction('atendimento', 'visualizar')) {
      setError('Seu perfil nao possui permissao para exportar o relatorio de atendimentos.');
      return;
    }
    setError('');
    setSuccess('');
    const result = await montarExportacaoAtendimentosPacoteZip();
    if (!result.success || !result.data) {
      setError(result.error ?? 'Nao foi possivel gerar o arquivo.');
      return;
    }
    const url = URL.createObjectURL(result.data.zipBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.data.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess(
      'Exportacao concluida — ZIP com atendimentos-materiais.csv (saldo no lote) e estornos-log.csv (historico de estornos).',
    );
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
  /** Ids de documentos que o refetch nao pode descartar (sessao em curso + painel do leitor aberto). */
  const documentosProtegidosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(sessaoRetirada.map((l) => l.documentoId));
    for (const c of leitorPainel?.candidatos ?? []) ids.add(c.documento.id);
    documentosProtegidosRef.current = ids;
  }, [sessaoRetirada, leitorPainel]);
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
  /** Gravacao na nuvem em curso (atendimento unico ou sessao): mantem o modal aberto com progresso. */
  const [gravandoAtendimento, setGravandoAtendimento] = useState(false);
  /** Apos sucesso: oferecer impressao do recibo. */
  const [reciboOpcional, setReciboOpcional] = useState<DadosReciboAtendimento | null>(null);
  /** Apos estorno confirmado: oferecer impressao do recibo de estorno. */
  const [reciboEstornoOpcional, setReciboEstornoOpcional] = useState<DadosReciboEstorno | null>(null);
  /** Geração/abertura de recibo em curso (evita fechar modal antes do PDF abrir). */
  const [reciboImprimindo, setReciboImprimindo] = useState(false);

  /** Modal de estorno: dados do documento + campos obrigatorios + recibo de estorno. */
  const [estornoAlvo, setEstornoAlvo] = useState<Atendimento | null>(null);
  const [estornoDocLoading, setEstornoDocLoading] = useState(false);
  const [estornoDocInfo, setEstornoDocInfo] = useState<{
    titulo: string;
    descricao: string;
    revisao: string;
    responsavel: string;
  } | null>(null);
  const [estornoNomeQuemEstorna, setEstornoNomeQuemEstorna] = useState('');
  const [estornoNomeQuemDevolve, setEstornoNomeQuemDevolve] = useState('');
  const [estornoMotivo, setEstornoMotivo] = useState('');
  /** Por item do lote: incluido no estorno e quantidade a devolver (<= ao registrado no lote). */
  const [estornoLinhas, setEstornoLinhas] = useState<Record<string, { marcado: boolean; quantidade: number }>>({});
  /** Estorno em gravacao na nuvem (desativa o botao Confirmar e mostra progresso). */
  const [estornoConfirmando, setEstornoConfirmando] = useState(false);
  const [estornoDuplicadosAviso, setEstornoDuplicadosAviso] = useState<AvisoLoteDuplicadoMaterial[]>([]);
  /** Chave V2 estavel por tentativa de confirmacao (retry/timeout). */
  const estornoIdempotencyKeyRef = useRef<string | null>(null);

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
      /** Fase A: 2 min em vez de 30 s — menos pressão no Supabase com snapshot grande. */
      return 120_000;
    },
    queryFn: async (): Promise<AtendimentoCorePayload> => {
      // Boot prioritário: lotes + colaboradores (UI «Lotes registrados»).
      // Pendentes de desenho em paralelo, mas sem bloquear se forem mais lentos:
      // se pendentes demorarem, devolvemos histórico já e o React Query refetch preenche docs.
      const histPromise = listarHistoricoAtendimentosComMeta();
      const colabPromise = listarColaboradoresAtivos();
      const docsPromise = listarDocumentosPendentesComMeta();

      const [histResult, colaboradoresAtivos] = await Promise.all([histPromise, colabPromise]);
      if (!histResult.success) {
        throw new Error(histResult.error ?? 'Nao foi possivel carregar o historico de atendimento.');
      }

      const docsResult = await Promise.race([
        docsPromise,
        new Promise<Awaited<ReturnType<typeof listarDocumentosPendentesComMeta>>>((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: true,
                data: [],
                meta: { source: 'local', fallbackReason: 'Pendentes a carregar em segundo plano.' },
              }),
            2500,
          );
        }),
      ]);

      // Se a corrida devolveu vazio por timeout, continua a carregar pendentes em fundo.
      if (
        docsResult.success &&
        (docsResult.data?.length ?? 0) === 0 &&
        docsResult.meta?.fallbackReason?.includes('segundo plano')
      ) {
        void docsPromise.then((late) => {
          if (late.success && (late.data?.length ?? 0) > 0) {
            void queryClient.setQueryData(atendimentoCoreQueryKey(user?.login), (prev: AtendimentoCorePayload | undefined) =>
              prev
                ? {
                    ...prev,
                    documentos: late.data ?? [],
                    // Carregamento em fundo concluido: limpa o aviso (nao herdar "segundo plano").
                    fallbackReason: late.meta?.fallbackReason ?? '',
                  }
                : prev,
            );
          }
        });
      }

      if (!docsResult.success) {
        return {
          documentos: [],
          historico: histResult.data ?? [],
          colaboradores: colaboradoresAtivos,
          fallbackReason: docsResult.error ?? histResult.meta?.fallbackReason ?? '',
        };
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
      setDocumentos((prev) =>
        reterDocumentosProtegidos(
          prev,
          mergeDocumentosPendentesPreservandoOperacao(prev, payload.documentos),
          documentosProtegidosRef.current,
        ),
      );
    } else {
      setDocumentos((prev) => reterDocumentosProtegidos(prev, payload.documentos, documentosProtegidosRef.current));
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

  /** Documento encontrado pela busca remota (fora dos primeiros pendentes do boot): entra na lista local. */
  const adicionarDocumentoPendenteRemoto = useCallback(
    (documento: AtendimentoDocumento) => {
      setDocumentos((prev) => (prev.some((d) => d.id === documento.id) ? prev : [...prev, documento]));
    },
    [setDocumentos],
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

  /** Mensagem exata do que falta para liberar o registro (null = pode registrar). */
  const motivoBloqueioAtendimento = useMemo(
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
      ),
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

  const podeRegistrarAtendimento = motivoBloqueioAtendimento === null;

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
      const maxLinha = quantidadeMaximaLinhaDocumento(linha);
      const max = quantidadeMaximaRestanteLeitor(linha, sessaoRetirada, documentoId);
      const q = Number(quantidadeInformada);
      if (!Number.isFinite(q) || q <= 0) {
        tocarFeedbackLeitor('erro');
        setError('Informe quantidade maior que zero (respeitando pendente e saldo).');
        return;
      }
      if (q > max) {
        tocarFeedbackLeitor('erro');
        const naSessao = obterQuantidadeLinhaSessao(sessaoRetirada, documentoId, linha.documentoItemId);
        setError(
          naSessao > 0
            ? `Quantidade excede o restante permitido (${max} ${linha.unidade} — ja ha ${naSessao} na sessao).`
            : `Quantidade excede o maximo permitido (${max} ${linha.unidade} — limite do pendente e saldo).`,
        );
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
          maxLinha,
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
    [leitorPainel, sessaoRetirada],
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

  /** Mensagem exata do bloqueio (ou null) — exibida junto ao botao «Confirmar retirada». */
  const motivoBloqueioSessaoRetirada = useMemo(
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
      ),
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
  const podeConfirmarSessaoRetirada = motivoBloqueioSessaoRetirada === null;

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

    // Modal aberto com progresso ate a nuvem confirmar todos os lotes.
    setGravandoAtendimento(true);
    try {
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
              empresa: extEmp.trim(),
            }
          : undefined,
      ),
    );
    } finally {
      setGravandoAtendimento(false);
      setConfirmacaoSessaoRetirada(null);
    }
  }

  function dispensarImpressaoReciboSessao() {
    setReciboSessaoOpcional(null);
  }

  async function imprimirReciboSessaoEfechar() {
    if (!reciboSessaoOpcional) return;
    setReciboImprimindo(true);
    setError('');
    try {
      const ok = await imprimirReciboSessaoConsolidada(reciboSessaoOpcional);
      if (!ok) {
        setError(
          'Nao foi possivel abrir a janela do recibo. Desative o bloqueador de popups para este site e tente de novo.',
        );
        return;
      }
      setReciboSessaoOpcional(null);
    } finally {
      setReciboImprimindo(false);
    }
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

      const buscarCandidatos = (docs: AtendimentoDocumento[]) =>
        docs.flatMap((d) => {
          const linha = d.linhas.find((l) => l.codigoMaterial.trim().toLowerCase() === codigoRef);
          return linha ? [{ documento: d, linha }] : [];
        });

      let candidatos = buscarCandidatos(documentos);

      // O boot carrega so os primeiros pendentes (de milhares). Se o material bipado
      // nao esta neles, busca na nuvem pelo codigo e incorpora os documentos achados.
      if (candidatos.length === 0) {
        const remotos = (await buscarDocumentosPendentesPorCodigoMaterialNuvem(material.codigo)).filter((doc) =>
          doc.linhas.some((l) => l.codigoMaterial.trim().toLowerCase() === codigoRef),
        );
        if (remotos.length > 0) {
          const idsLocais = new Set(documentos.map((d) => d.id));
          const novos = remotos.filter((d) => !idsLocais.has(d.id));
          if (novos.length > 0) {
            setDocumentos((prev) => {
              const ids = new Set(prev.map((d) => d.id));
              const adicionar = novos.filter((d) => !ids.has(d.id));
              return adicionar.length ? [...prev, ...adicionar] : prev;
            });
          }
          candidatos = buscarCandidatos([...documentos, ...novos]);
        }
      }

      const candidatosComRestante = candidatos.filter(
        (c) => quantidadeMaximaRestanteLeitor(c.linha, sessaoRetirada, c.documento.id) > 0,
      );

      setLeitorPainel({ scan, material, candidatos, passo: 'escolher' });

      if (candidatos.length === 0) {
        tocarFeedbackLeitor('erro');
        setError(
          'Nenhum documento pendente inclui este material. E necessario cadastro, recebimento (saldo) e linha no documento.',
        );
      } else if (candidatosComRestante.length === 0) {
        tocarFeedbackLeitor('erro');
        const ref = candidatos[0];
        const qtd =
          ref != null
            ? obterQuantidadeLinhaSessao(sessaoRetirada, ref.documento.id, ref.linha.documentoItemId)
            : 0;
        setError(
          qtd > 0
            ? `Material ${material.codigo} ja consta na sessao (${qtd} ${ref?.linha.unidade ?? 'UN'}). Bipe outro codigo ou confirme a retirada.`
            : `Material ${material.codigo} sem quantidade restante nestes documentos (pendente/saldo esgotado).`,
        );
      } else {
        tocarFeedbackLeitor('sucesso');
      }
    },
    [documentos, sessaoRetirada, canAccessAction, setDocumentos],
  );

  const fecharLeitorPainel = useCallback(() => {
    setLeitorPainel(null);
  }, []);

  const sessaoDocumentoCount = useMemo(
    () => new Set(sessaoRetirada.map((l) => l.documentoId)).size,
    [sessaoRetirada],
  );

  useRegistrarAtendimentoOperacaoGuard({
    ativa: sessaoRetirada.length > 0,
    itemCount: sessaoRetirada.length,
    documentoCount: sessaoDocumentoCount,
    totalUnidades: totalUnidadesSessao(sessaoRetirada),
    onDescartar: () => {
      limparSessaoRetirada();
      setLeitorPainel(null);
      setConfirmacaoSessaoRetirada(null);
      setError('');
      setSuccess('');
    },
    onConfirmarRetirada: () => {
      setLeitorPainel(null);
      pedirConfirmacaoSessaoRetirada();
    },
  });

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

    // Mantem o modal aberto com indicador de progresso ate a nuvem confirmar
    // (a gravacao + recarga podem levar dezenas de segundos em snapshot grande).
    setGravandoAtendimento(true);
    try {
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
                empresa: extEmp.trim(),
              }
            : undefined,
      });
    }
    } finally {
      setGravandoAtendimento(false);
      setConfirmacaoAtendimento(null);
    }
  }

  function dispensarImpressaoRecibo() {
    setReciboOpcional(null);
  }

  async function imprimirReciboEfechar() {
    if (!reciboOpcional) return;
    setReciboImprimindo(true);
    setError('');
    try {
      const ok = await imprimirReciboAtendimento(reciboOpcional);
      if (!ok) {
        setError(
          'Nao foi possivel abrir a janela do recibo. Desative o bloqueador de popups para este site e tente de novo.',
        );
        return;
      }
      setReciboOpcional(null);
    } finally {
      setReciboImprimindo(false);
    }
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
    setEstornoDuplicadosAviso([]);
    // Mantem idempotencyKey apos fechar com falha/timeout — retry reutiliza a mesma chave.
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

  async function imprimirReciboEstornoEfechar() {
    if (!reciboEstornoOpcional) return;
    setReciboImprimindo(true);
    setError('');
    try {
      const ok = await imprimirReciboEstorno(reciboEstornoOpcional);
      if (!ok) {
        setError('Nao foi possivel abrir a janela do recibo de estorno. Desative o bloqueador de popups.');
        return;
      }
      setReciboEstornoOpcional(null);
    } finally {
      setReciboImprimindo(false);
    }
  }

  /** Estorno de material: fluxo exclusivo PC/web (seguranca — nao existe no app Campo). */
  async function iniciarEstorno(item: Atendimento) {
    setError('');
    setSuccess('');
    setSnapshotConflict(false);
    if (!canAccessAction('atendimento', 'administrar')) {
      setError('Seu perfil nao possui permissao para estornar atendimento.');
      return;
    }
    // Novo alvo = nova operacao (nao reutilizar chave de outro lote).
    if (!estornoAlvo || estornoAlvo.id !== item.id) {
      estornoIdempotencyKeyRef.current = null;
    }
    setEstornoAlvo(item);
    setEstornoDocInfo(null);
    setEstornoNomeQuemEstorna('');
    setEstornoNomeQuemDevolve('');
    setEstornoMotivo('');
    setEstornoLinhas(
      Object.fromEntries(item.itens.map((it) => [it.id, { marcado: true, quantidade: it.quantidadeAtendida }])),
    );
    setEstornoDuplicadosAviso(encontrarOutrosLotesMesmoMaterialDocumento(historico, item));
    setEstornoDocLoading(true);
    const meta = await montarMetadadosDocumentoAtendimento(item);
    setEstornoDocInfo({
      titulo: meta.documentoTitulo,
      descricao: meta.documentoDescricao,
      revisao: meta.documentoRevisao,
      responsavel: meta.documentoResponsavel,
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
      setReciboImprimindo(true);
      const ok = await imprimirReciboEstorno(dados);
      if (!ok) {
        setError('Nao foi possivel abrir a janela de impressao. Desative o bloqueador de popups.');
      }
    } catch {
      setError('Nao foi possivel montar o recibo de estorno.');
    } finally {
      setReciboImprimindo(false);
    }
  }

  async function confirmarEstornoFinal() {
    if (!estornoAlvo || estornoConfirmando) return;
    setError('');
    if (!validarCamposEstorno()) return;
    const linhas = montarLinhasEstornoRequest();
    let dadosRecibo: DadosReciboEstorno;
    setEstornoConfirmando(true);
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
      setEstornoConfirmando(false);
      setError('Nao foi possivel montar o recibo de estorno.');
      return;
    }

    setSnapshotConflict(false);
    const numero = estornoAlvo.numero;
    if (!estornoIdempotencyKeyRef.current) {
      estornoIdempotencyKeyRef.current = buildEstornoV2IdempotencyKey({
        loteId: estornoAlvo.id,
        loteNumero: estornoAlvo.numero,
        linhas: linhas.map((l) => ({
          atendimentoItemId: l.atendimentoItemId,
          quantidade: l.quantidade,
        })),
        motivo: estornoMotivo,
      });
    }
    const idempotencyKey = estornoIdempotencyKeyRef.current;

    let result: Awaited<ReturnType<typeof estornarAtendimento>>;
    // V2 e rapido; legado MULTIPLOS ainda pode precisar de margem.
    const desenhosNoLote = new Set(
      estornoAlvo.itens.map((it) => String(it.documentoNumero ?? '').trim()).filter((n) => n && n !== '-'),
    ).size;
    const ESTORNO_TIMEOUT_MS = Math.min(180_000, 60_000 + Math.max(0, desenhosNoLote - 1) * 30_000);
    try {
      result = await Promise.race([
        estornarAtendimento(estornoAlvo.id, linhas, {
          nomeQuemEstorna: estornoNomeQuemEstorna,
          nomeQuemDevolve: estornoNomeQuemDevolve,
          motivoEstorno: estornoMotivo,
          atendimentoSnapshot: estornoAlvo,
          idempotencyKey,
        }),
        new Promise<Awaited<ReturnType<typeof estornarAtendimento>>>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'O estorno demorou demais na nuvem. A confirmar se ja concluiu (idempotencia)...',
                ),
              ),
            ESTORNO_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      captureOperationalEvent('estorno_timeout', { idempotencyKeyPrefix: idempotencyKey.slice(0, 24) }, 'warning');
      // Confirmacao tardia: reenviar com a MESMA chave — servidor devolve resultado ja gravado.
      try {
        result = await estornarAtendimento(estornoAlvo.id, linhas, {
          nomeQuemEstorna: estornoNomeQuemEstorna,
          nomeQuemDevolve: estornoNomeQuemDevolve,
          motivoEstorno: estornoMotivo,
          atendimentoSnapshot: estornoAlvo,
          idempotencyKey,
        });
        if (result.success) {
          captureOperationalEvent(
            result.meta?.idempotentHit ? 'estorno_idempotent_hit' : 'estorno_late_confirm',
            { idempotencyKeyPrefix: idempotencyKey.slice(0, 24), durationMs: result.meta?.durationMs },
            'info',
          );
        } else {
          result = {
            success: false,
            error:
              (err instanceof Error && err.message ? err.message : 'Timeout no estorno.') +
              ' Se o lote ja aparecer como estornado, nao confirme de novo.',
          };
        }
      } catch {
        captureOperationalEvent('estorno_network', { idempotencyKeyPrefix: idempotencyKey.slice(0, 24) }, 'warning');
        result = {
          success: false,
          error: err instanceof Error && err.message ? err.message : 'Nao foi possivel estornar o atendimento.',
        };
      }
    } finally {
      setEstornoConfirmando(false);
    }
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel estornar o atendimento.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
      return;
    }

    // Atualizacao incremental — nao bloquear com load() completo (7 MB).
    const atualizado = result.data!;
    const docsDelta = Array.isArray(result.meta?.documentosAfetados)
      ? (result.meta!.documentosAfetados as Array<{
          documentoId?: string;
          documentoItemId?: string;
          delta?: number;
        }>)
      : [];
    const aplicarDeltasDocs = (docs: AtendimentoDocumento[]) => {
      if (!docsDelta.length) return docs;
      return docs.map((doc) => {
        const afetados = docsDelta.filter((d) => d.documentoId === doc.id);
        if (!afetados.length) return doc;
        return {
          ...doc,
          linhas: doc.linhas.map((linha) => {
            const hit = afetados.find((d) => d.documentoItemId === linha.documentoItemId);
            if (!hit) return linha;
            const delta = Number(hit.delta) || 0;
            // delta e negativo (estorno); quantidadeAtendida diminui.
            const nextQ = Math.max(0, (Number(linha.quantidadeAtendida) || 0) + delta);
            return { ...linha, quantidadeAtendida: nextQ };
          }),
        };
      });
    };
    setHistorico((prev) => {
      const idx = prev.findIndex((a) => a.id === atualizado.id || a.numero === atualizado.numero);
      if (idx === -1) return [atualizado, ...prev];
      const next = [...prev];
      next[idx] = atualizado;
      return next;
    });
    setDocumentos((prev) => aplicarDeltasDocs(prev));
    queryClient.setQueryData(
      atendimentoCoreQueryKey(user?.login),
      (prev: AtendimentoCorePayload | undefined) => {
        if (!prev) return prev;
        const hist = [...prev.historico];
        const idx = hist.findIndex((a) => a.id === atualizado.id || a.numero === atualizado.numero);
        if (idx === -1) hist.unshift(atualizado);
        else hist[idx] = atualizado;
        return { ...prev, historico: hist, documentos: aplicarDeltasDocs(prev.documentos) };
      },
    );
    // Revalidacao leve em fundo (merge), sem travar o sucesso.
    void load({ silent: true });

    fecharModalEstorno();
    estornoIdempotencyKeyRef.current = null;
    const loteEncerrado = !atualizado.itens?.length;
    const rtt =
      typeof result.meta?.durationMs === 'number' ? ` (${result.meta.durationMs} ms)` : '';
    setSuccess(
      loteEncerrado
        ? `Atendimento ${numero} estornado com sucesso (lote encerrado).${rtt}`
        : `Estorno parcial registrado no atendimento ${numero}.${rtt}`,
    );
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
    adicionarDocumentoPendenteRemoto,
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
    motivoBloqueioAtendimento,
    gravandoAtendimento,
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
    estornoConfirmando,
    iniciarEstorno,
    estornoLinhas,
    setEstornoLinhas,
    estornoDuplicadosAviso,
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
    motivoBloqueioSessaoRetirada,
    pedirConfirmacaoSessaoRetirada,
    confirmacaoSessaoRetirada,
    cancelarConfirmacaoSessaoRetirada,
    confirmarSessaoRetiradaNoModal,
    reciboSessaoOpcional,
    dispensarImpressaoReciboSessao,
    imprimirReciboSessaoEfechar,
    reciboImprimindo,
  };
}

export function totalizarLinhas(linhas: AtendimentoDocumentoLinha[]) {
  return linhas.reduce((total, linha) => total + linha.quantidadeNestaOperacao, 0);
}
