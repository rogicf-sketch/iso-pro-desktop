import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { listarColaboradoresAtivos } from '../../colaboradores/services/colaboradores.service';
import { tocarFeedbackLeitor } from '../../../lib/leitorFeedbackSonoro';
import {
  aquecerIndiceLeituraMateriais,
  buscarMaterialPorLeituraCodigo,
} from '../../materiais/services/materiais.service';
import type { Material } from '../../materiais/types/material.types';
import {
  aquecerBaselineAtendimentoNuvem,
  aquecerSaldoOperacionalAtendimento,
  buscarDocumentosPendentesPorCodigoMaterialNuvem,
  estornarAtendimento,
  hidratarDocumentoPendenteAtendimento,
  listarDocumentosPendentesComMeta,
  listarHistoricoAtendimentosPagina,
  montarExportacaoAtendimentosCsvItens,
  montarExportacaoEstornosCsv,
  registrarAtendimento,
  registrarAtendimentosSessao,
  type HistoricoAtendimentosPage,
} from '../services/atendimento.service';

export type HistoricoPeriodoFiltro = 'hoje' | '7d' | '30d' | 'todos';
import { buildEstornoV2IdempotencyKey } from '../services/estornoAtendimentoV2';
import { captureOperationalEvent } from '../../../lib/errorReporting';
import {
  claimAtendimentoDocumentoLock,
  isAtendimentoLockHeldByOther,
  mensagemAtendimentoLockBloqueado,
  releaseAtendimentoDocumentoLock,
} from '../../../lib/atendimentoDocumentoLock';
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
  colaboradores: Colaborador[];
  fallbackReason: string;
  listSource: 'supabase' | 'local';
};

function atendimentoCoreQueryKey(userLogin: string | undefined) {
  return ['atendimento', 'core', userLogin ?? ''] as const;
}

function atendimentoHistoricoQueryKey(
  userLogin: string | undefined,
  page: number,
  pageSize: number,
  busca: string,
  periodo: HistoricoPeriodoFiltro,
) {
  return ['atendimento', 'historico', userLogin ?? '', page, pageSize, busca, periodo] as const;
}

function desdeIsoDePeriodo(periodo: HistoricoPeriodoFiltro): string | null {
  if (periodo === 'todos') return null;
  const agora = Date.now();
  if (periodo === 'hoje') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const dias = periodo === '7d' ? 7 : 30;
  return new Date(agora - dias * 24 * 60 * 60 * 1000).toISOString();
}

type HistoricoQueryData = HistoricoAtendimentosPage & { source?: 'supabase' | 'local' };

function prependHistoricoCache(
  prev: HistoricoQueryData | Atendimento[] | undefined,
  novos: Atendimento[],
  pageSize: number,
): HistoricoQueryData | undefined {
  if (!prev) return prev;
  if (Array.isArray(prev)) {
    const merged = [...novos, ...prev.filter((a) => !novos.some((n) => n.id === a.id))];
    return { items: merged.slice(0, pageSize), totalCount: merged.length, limit: pageSize, offset: 0 };
  }
  const merged = [...novos, ...prev.items.filter((a) => !novos.some((n) => n.id === a.id))];
  return {
    ...prev,
    items: merged.slice(0, pageSize),
    totalCount: prev.totalCount + novos.filter((n) => !prev.items.some((p) => p.id === n.id)).length,
  };
}

/** Seed do desenho ja na UI — evita re-fetch na nuvem no Confirmar (critico no leitor). */
function documentoSeedFromUi(doc: AtendimentoDocumento) {
  return {
    id: doc.id,
    numero: doc.numero,
    revisao: doc.revisao,
    descricao: doc.descricao,
    responsavel: doc.responsavel,
    status: doc.status,
    itens: doc.linhas.map((l) => ({
      id: l.documentoItemId,
      codigoMaterial: l.codigoMaterial,
      descricaoMaterial: l.descricaoMaterial,
      unidade: l.unidade,
      quantidadeProjeto: l.quantidadeProjeto,
      quantidadeAtendida: l.quantidadeAtendida,
      localizacao: '',
    })),
  };
}

/** Lotes por pagina na zona Historico (WMS: poucas linhas no DOM — setas Anterior/Proxima). */
export const ATENDIMENTO_HISTORICO_PAGE_SIZE = 15;

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
      ? 'Ha itens marcados sem quantidade valida. Ajuste a quantidade (ate o saldo e o pendente).'
      : 'Marque ao menos um item e informe quantidade maior que zero.';
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
  /** `null` enquanto o passo e `buscando` (cadastro + desenhos pendentes na nuvem). */
  material: Material | null;
  candidatos: AtendimentoLeitorCandidato[];
  documentoSelecionadoId?: string;
  passo?: 'buscando' | 'escolher' | 'concluido';
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
  const prevById = new Map(prev.map((d) => [d.id, d]));
  // Refetch pode trazer doc protegido so com cabecalho — reaplicar linhas da sessao.
  const comLinhas = base.map((doc) => {
    if (doc.linhas.length > 0 || !protegidos.has(doc.id)) return doc;
    const prevDoc = prevById.get(doc.id);
    if (!prevDoc?.linhas.length) return doc;
    return { ...doc, linhas: prevDoc.linhas };
  });
  const idsBase = new Set(comLinhas.map((d) => d.id));
  const faltantes = prev.filter((d) => protegidos.has(d.id) && !idsBase.has(d.id));
  return faltantes.length ? [...comLinhas, ...faltantes] : comLinhas;
}

/**
 * Junta lista da nuvem com a sessao aberta.
 * A lista rapida vem so com cabecalho (linhas:[]); nao pode apagar itens ja hidratados.
 */
export function mergeDocumentosPendentesPreservandoOperacao(
  prev: AtendimentoDocumento[],
  next: AtendimentoDocumento[],
): AtendimentoDocumento[] {
  const prevById = new Map(prev.map((d) => [d.id, d]));
  return next.map((doc) => {
    const prevDoc = prevById.get(doc.id);
    if (!prevDoc) return doc;
    // Refetch ao voltar a janela: cabecalho sem itens — manter linhas e quantidades digitadas.
    if (!doc.linhas.length && prevDoc.linhas.length > 0) {
      return {
        ...prevDoc,
        numero: doc.numero || prevDoc.numero,
        revisao: doc.revisao || prevDoc.revisao,
        descricao: doc.descricao || prevDoc.descricao,
        responsavel: doc.responsavel || prevDoc.responsavel,
        status: doc.status || prevDoc.status,
        linhas: prevDoc.linhas,
      };
    }
    const prevLinha = new Map(prevDoc.linhas.map((l) => [l.documentoItemId, l]));
    return {
      ...doc,
      linhas: doc.linhas.map((linha) => {
        const pl = prevLinha.get(linha.documentoItemId);
        if (!pl) return linha;
        const cap = quantidadeMaximaAtendimentoLinha(linha);
        const q = Math.min(pl.quantidadeNestaOperacao, cap);
        return { ...linha, quantidadeNestaOperacao: Math.max(0, q) };
      }),
    };
  });
}

export function useAtendimento() {
  const queryClient = useQueryClient();
  const { canAccessAction, user } = useAuth();

  const hasCloudConfig = hasSupabaseConfig();
  const [documentos, setDocumentos] = useState<AtendimentoDocumento[]>([]);
  const [historico, setHistorico] = useState<Atendimento[]>([]);
  const [historicoTotalCount, setHistoricoTotalCount] = useState(0);
  const [historicoPage, setHistoricoPage] = useState(1);
  const [historicoBusca, setHistoricoBusca] = useState('');
  const [historicoBuscaDebounced, setHistoricoBuscaDebounced] = useState('');
  const [historicoPeriodo, setHistoricoPeriodo] = useState<HistoricoPeriodoFiltro>('7d');
  const [selectedDocumentoId, setSelectedDocumentoId] = useState('');
  const [documentoLockAviso, setDocumentoLockAviso] = useState('');
  /** True quando outro posto detém o desenho selecionado — bip/gravação bloqueados. */
  const [documentoLockBloqueado, setDocumentoLockBloqueado] = useState(false);
  const lockHeldDocRef = useRef('');
  const documentoLockBloqueadoRef = useRef(false);
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
  const [exportingRelatorio, setExportingRelatorio] = useState<'atendimentos' | 'estornos' | null>(
    null,
  );
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [fallbackReason, setFallbackReason] = useState('');
  const [listSource, setListSource] = useState<'supabase' | 'local'>('local');
  /** Itens marcados para esta operacao (checkbox). Ao trocar de documento, todos comecam marcados. */
  const [idsMarcados, setIdsMarcados] = useState<Set<string>>(new Set());

  function baixarCsv(csv: string, fileName: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function rotuloPeriodoExport(periodo: HistoricoPeriodoFiltro): string {
    if (periodo === 'hoje') return 'hoje';
    if (periodo === '7d') return '7 dias';
    if (periodo === '30d') return '30 dias';
    return 'todo o historico';
  }

  async function exportarAtendimentosMateriaisExcel() {
    if (!canAccessAction('atendimento', 'visualizar')) {
      setError('Seu perfil nao possui permissao para exportar o relatorio de atendimentos.');
      return;
    }
    if (exportingRelatorio) return;
    setError('');
    setSuccess('');
    setExportingRelatorio('atendimentos');
    try {
      const desde = desdeIsoDePeriodo(historicoPeriodo);
      const result = await montarExportacaoAtendimentosCsvItens({ desde });
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel gerar o arquivo de atendimentos.');
        return;
      }
      baixarCsv(result.data.csv, result.data.fileName);
      setSuccess(`Exportacao de atendimentos concluida (${rotuloPeriodoExport(historicoPeriodo)}).`);
    } finally {
      setExportingRelatorio(null);
    }
  }

  async function exportarEstornosExcel() {
    if (!canAccessAction('atendimento', 'visualizar')) {
      setError('Seu perfil nao possui permissao para exportar o relatorio de estornos.');
      return;
    }
    if (exportingRelatorio) return;
    setError('');
    setSuccess('');
    setExportingRelatorio('estornos');
    try {
      const desde = desdeIsoDePeriodo(historicoPeriodo);
      const result = await montarExportacaoEstornosCsv({ desde });
      if (!result.success || !result.data) {
        setError(result.error ?? 'Nao foi possivel gerar o arquivo de estornos.');
        return;
      }
      baixarCsv(result.data.csv, result.data.fileName);
      setSuccess(`Exportacao de estornos concluida (${rotuloPeriodoExport(historicoPeriodo)}).`);
    } finally {
      setExportingRelatorio(null);
    }
  }  /**
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
  /** Sequencia da busca do leitor: fechar o modal invalida resultados tardios da nuvem. */
  const leitorBuscaSeqRef = useRef(0);
  /** Fila multi-desenho antes de confirmar retirada unica + recibo consolidado. */
  const [sessaoRetirada, setSessaoRetirada] = useState<SessaoRetiradaLinha[]>([]);
  /** Ids que o refetch nao pode descartar (aberto na UI, sessao, painel do leitor). */
  const documentosProtegidosRef = useRef<Set<string>>(new Set());
  const selectedDocumentoIdRef = useRef(selectedDocumentoId);
  selectedDocumentoIdRef.current = selectedDocumentoId;

  const protegerDocumentoId = useCallback((documentoId: string) => {
    const id = documentoId.trim();
    if (!id) return;
    const next = new Set(documentosProtegidosRef.current);
    next.add(id);
    documentosProtegidosRef.current = next;
  }, []);

  useEffect(() => {
    const ids = new Set(sessaoRetirada.map((l) => l.documentoId));
    for (const c of leitorPainel?.candidatos ?? []) ids.add(c.documento.id);
    const aberto = selectedDocumentoId.trim();
    if (aberto) ids.add(aberto);
    documentosProtegidosRef.current = ids;
  }, [sessaoRetirada, leitorPainel, selectedDocumentoId]);
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
  const lastHistoricoAppliedRef = useRef<number>(0);

  const listQuery = useQuery({
    queryKey: atendimentoCoreQueryKey(user?.login),
    placeholderData: keepPreviousData,
    /** Foco/visibilidade: efeito dedicado com debounce 350ms (evita refetch em rajada). */
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (!hasCloudConfig) return false;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      // Nao competir com o Confirmar (canteiro: 1 ligacao lenta engole a RPC).
      if (gravandoAtendimento || estornoConfirmando) return false;
      /** Fase A: 2 min em vez de 30 s — menos pressão no Supabase com snapshot grande. */
      return 120_000;
    },
    queryFn: async (): Promise<AtendimentoCorePayload> => {
      // Boot WMS: so o necessario para OPERAR (pendentes + colaboradores).
      // Historico completo fica na zona «Historico» sob demanda — nao bloqueia o bipe.
      void aquecerBaselineAtendimentoNuvem();
      void aquecerSaldoOperacionalAtendimento();
      void aquecerIndiceLeituraMateriais();
      const colabPromise = listarColaboradoresAtivos();
      const docsPromise = listarDocumentosPendentesComMeta();

      const colaboradoresAtivos = await colabPromise;

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
                    fallbackReason: late.meta?.fallbackReason ?? '',
                    listSource: late.meta?.source === 'supabase' ? 'supabase' : prev.listSource,
                  }
                : prev,
            );
          }
        });
      }

      if (!docsResult.success) {
        return {
          documentos: [],
          colaboradores: colaboradoresAtivos,
          fallbackReason: docsResult.error ?? '',
          listSource: 'local' as const,
        };
      }

      return {
        documentos: docsResult.data ?? [],
        colaboradores: colaboradoresAtivos,
        fallbackReason: docsResult.meta?.fallbackReason ?? '',
        listSource: (docsResult.meta?.source === 'supabase' ? 'supabase' : 'local') as 'supabase' | 'local',
      };
    },
  });

  useEffect(() => {
    const t = window.setTimeout(() => setHistoricoBuscaDebounced(historicoBusca.trim()), 300);
    return () => window.clearTimeout(t);
  }, [historicoBusca]);

  useEffect(() => {
    setHistoricoPage(1);
  }, [historicoBuscaDebounced, historicoPeriodo]);

  /** Arquivo de lotes: so dispara quando a zona Historico e pedida (ou export/estorno). */
  const [historicoArquivoAtivo, setHistoricoArquivoAtivo] = useState(false);
  const historicoQuery = useQuery({
    queryKey: atendimentoHistoricoQueryKey(
      user?.login,
      historicoPage,
      ATENDIMENTO_HISTORICO_PAGE_SIZE,
      historicoBuscaDebounced,
      historicoPeriodo,
    ),
    enabled: historicoArquivoAtivo,
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (!historicoArquivoAtivo || !hasCloudConfig) return false;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
      return 180_000;
    },
    queryFn: async (): Promise<HistoricoQueryData> => {
      const histResult = await listarHistoricoAtendimentosPagina({
        page: historicoPage,
        pageSize: ATENDIMENTO_HISTORICO_PAGE_SIZE,
        q: historicoBuscaDebounced,
        desde: desdeIsoDePeriodo(historicoPeriodo),
      });
      if (!histResult.success || !histResult.data) {
        throw new Error(histResult.error ?? 'Nao foi possivel carregar o historico de atendimento.');
      }
      return {
        ...histResult.data,
        source: histResult.meta?.source === 'supabase' ? 'supabase' : 'local',
      };
    },
  });

  const ensureHistoricoCarregado = useCallback(() => {
    setHistoricoArquivoAtivo(true);
    // Sempre refetch: apos Confirmar o cache pode ter so o lote novo (lista incompleta).
    void queryClient.invalidateQueries({ queryKey: ['atendimento', 'historico'] });
  }, [queryClient]);

  const recarregarHistorico = useCallback(async () => {
    setHistoricoArquivoAtivo(true);
    await queryClient.invalidateQueries({ queryKey: ['atendimento', 'historico'] });
  }, [queryClient]);

  const setHistoricoPeriodoFiltro = useCallback((periodo: HistoricoPeriodoFiltro) => {
    setHistoricoPeriodo(periodo);
  }, []);

  const setHistoricoBuscaFiltro = useCallback((busca: string) => {
    setHistoricoBusca(busca);
  }, []);

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

    /** Timeout do boot (2.5s) devolve lista vazia — nao pode apagar pendentes/selecao ja na UI. */
    const placeholderSegundoPlano =
      payload.documentos.length === 0 &&
      (payload.fallbackReason?.includes('segundo plano') ?? false);

    if (!placeholderSegundoPlano) {
      const protegidos = new Set(documentosProtegidosRef.current);
      const aberto = selectedDocumentoIdRef.current.trim();
      if (aberto) protegidos.add(aberto);

      if (mode === 'merge') {
        setDocumentos((prev) =>
          reterDocumentosProtegidos(
            prev,
            mergeDocumentosPendentesPreservandoOperacao(prev, payload.documentos),
            protegidos,
          ),
        );
      } else {
        setDocumentos((prev) => reterDocumentosProtegidos(prev, payload.documentos, protegidos));
        setDocumentosListaTick((n) => n + 1);
        ultimoDocumentoComSugestaoAplicadaRef.current = '';
      }
      setListSource(payload.listSource ?? 'local');
    }
    // Historico nao vem do core — zona Arquivo tem query propria.
    setColaboradores(payload.colaboradores);
    setFallbackReason(payload.fallbackReason);
  }, [listQuery.data, listQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!historicoArquivoAtivo || !historicoQuery.data) return;
    if (historicoQuery.dataUpdatedAt === lastHistoricoAppliedRef.current) return;
    lastHistoricoAppliedRef.current = historicoQuery.dataUpdatedAt;
    setHistorico(historicoQuery.data.items);
    setHistoricoTotalCount(historicoQuery.data.totalCount);
  }, [historicoArquivoAtivo, historicoQuery.data, historicoQuery.dataUpdatedAt]);

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
  const historicoLoading = historicoArquivoAtivo && (historicoQuery.isLoading || historicoQuery.isFetching);
  const historicoFetchError =
    historicoArquivoAtivo && historicoQuery.isError && !historicoQuery.data
      ? historicoQuery.error instanceof Error
        ? historicoQuery.error.message
        : 'Nao foi possivel carregar o historico de atendimento.'
      : '';

  const selectedDocumento = useMemo(
    () => documentos.find((documento) => documento.id === selectedDocumentoId) ?? null,
    [documentos, selectedDocumentoId],
  );

  /** Documento encontrado pela busca remota (fora dos primeiros pendentes do boot): entra na lista local. */
  const adicionarDocumentoPendenteRemoto = useCallback(
    (documento: AtendimentoDocumento) => {
      protegerDocumentoId(documento.id);
      setDocumentos((prev) => (prev.some((d) => d.id === documento.id) ? prev : [...prev, documento]));
    },
    [protegerDocumentoId],
  );

  const selecionarDocumentoId = useCallback(
    (documentoId: string) => {
      protegerDocumentoId(documentoId);
      selectedDocumentoIdRef.current = documentoId;
      setSelectedDocumentoId(documentoId);
    },
    [protegerDocumentoId],
  );

  useEffect(() => {
    const login = (user?.login ?? '').trim();
    const docId = selectedDocumentoId.trim();
    let cancelled = false;

    async function syncLock() {
      const prev = lockHeldDocRef.current;
      if (prev && prev !== docId && login) {
        void releaseAtendimentoDocumentoLock({ documentoId: prev, holderLogin: login });
        lockHeldDocRef.current = '';
      }
      if (!docId || !login) {
        setDocumentoLockAviso('');
        setDocumentoLockBloqueado(false);
        documentoLockBloqueadoRef.current = false;
        return;
      }
      const claim = await claimAtendimentoDocumentoLock({
        documentoId: docId,
        holderLogin: login,
        holderLabel: (user?.nome ?? login).trim(),
        ttlSeconds: 120,
      });
      if (cancelled) return;
      if (isAtendimentoLockHeldByOther(claim)) {
        const msg = mensagemAtendimentoLockBloqueado(claim);
        setDocumentoLockAviso(msg);
        setDocumentoLockBloqueado(true);
        documentoLockBloqueadoRef.current = true;
        lockHeldDocRef.current = '';
        return;
      }
      setDocumentoLockAviso('');
      setDocumentoLockBloqueado(false);
      documentoLockBloqueadoRef.current = false;
      if (claim.ok) {
        lockHeldDocRef.current = docId;
      }
    }

    void syncLock();
    // Revalida mesmo quando bloqueado (outro posto pode libertar).
    const heartbeat = setInterval(() => {
      void syncLock();
    }, 45_000);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      const held = lockHeldDocRef.current;
      if (held && login) {
        lockHeldDocRef.current = '';
        void releaseAtendimentoDocumentoLock({ documentoId: held, holderLogin: login });
      }
    };
  }, [selectedDocumentoId, user?.login, user?.nome]);

  useEffect(() => {
    if (!selectedDocumentoId) {
      setIdsMarcados(new Set());
      ultimoDocumentoComSugestaoAplicadaRef.current = '';
      return;
    }
    const doc = documentos.find((d) => d.id === selectedDocumentoId);
    if (!doc) return;

    // Lista rápida: cabeçalho sem itens — hidrata ao seleccionar.
    if (!doc.linhas.length) {
      let cancelled = false;
      void hidratarDocumentoPendenteAtendimento(selectedDocumentoId).then((full) => {
        if (cancelled || !full) return;
        // Parcial-first: abre com quantidade vazia; atalho «máx» ou * preenche o teto.
        const linhasAbertas = full.linhas.map((linha) => ({
          ...linha,
          quantidadeNestaOperacao: 0,
        }));
        setDocumentos((current) =>
          current.map((d) =>
            d.id === full.id ? { ...d, ...full, linhas: linhasAbertas } : d,
          ),
        );
        if (linhasAbertas.length) {
          ultimoDocumentoComSugestaoAplicadaRef.current = selectedDocumentoId;
          setIdsMarcados(new Set(linhasAbertas.map((l) => l.documentoItemId)));
        }
      });
      return () => {
        cancelled = true;
      };
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
                quantidadeNestaOperacao: 0,
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
  const motivoBloqueioAtendimento = useMemo(() => {
    if (documentoLockBloqueado) {
      return (
        documentoLockAviso ||
        'Desenho em uso por outro posto. Atendimento bloqueado neste documento.'
      );
    }
    return obterErroRegistroAtendimento(
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
  }, [
    documentoLockBloqueado,
    documentoLockAviso,
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
  ]);

  const podeRegistrarAtendimento = motivoBloqueioAtendimento === null;

  const toggleMarcaItem = useCallback(
    (documentoItemId: string, marcado: boolean) => {
      if (documentoLockBloqueadoRef.current) {
        setError(
          documentoLockAviso ||
            'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
        );
        return;
      }
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
              // Marcar nao inventa quantidade — digitar ou «máx».
              if (!marcado) return { ...linha, quantidadeNestaOperacao: 0 };
              return linha;
            }),
          };
        }),
      );
    },
    [documentoLockAviso, selectedDocumentoId, setDocumentos],
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
    async (documentoId: string, quantidadeInformada: number) => {
      if (!leitorPainel) return;
      const cand = leitorPainel.candidatos.find((c) => c.documento.id === documentoId);
      if (!cand) return;

      const login = (user?.login ?? '').trim();
      if (login) {
        const claim = await claimAtendimentoDocumentoLock({
          documentoId,
          holderLogin: login,
          holderLabel: (user?.nome ?? login).trim(),
          ttlSeconds: 120,
        });
        if (isAtendimentoLockHeldByOther(claim)) {
          tocarFeedbackLeitor('erro');
          setError(mensagemAtendimentoLockBloqueado(claim));
          return;
        }
        if (claim.ok && selectedDocumentoId === documentoId) {
          lockHeldDocRef.current = documentoId;
          setDocumentoLockBloqueado(false);
          documentoLockBloqueadoRef.current = false;
          setDocumentoLockAviso('');
        }
      }

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
        `${leitorPainel.material?.codigo ?? linha.codigoMaterial} incluido na sessao (${q} ${linha.unidade}) — ${documento.numero} Rev. ${documento.revisao}.`,
      );
      tocarFeedbackLeitor('confirmado');
    },
    [leitorPainel, selectedDocumentoId, sessaoRetirada, user?.login, user?.nome],
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
  }, [setDocumentos, setSessaoRetirada]);

  const limparSessaoRetirada = useCallback(() => {
    setSessaoRetirada([]);
    setDocumentos((current) =>
      current.map((doc) => ({
        ...doc,
        linhas: doc.linhas.map((linha) => ({ ...linha, quantidadeNestaOperacao: 0 })),
      })),
    );
    setIdsMarcados(new Set());
  }, [setDocumentos, setSessaoRetirada, setIdsMarcados]);

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
    if (documentoLockBloqueado) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
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
    void aquecerBaselineAtendimentoNuvem();
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
    if (documentoLockBloqueado) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
      setConfirmacaoSessaoRetirada(null);
      return;
    }

    const tConfirm0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Progresso ja no modal — nao reclamar locks aqui (ja feitos ao incluir no leitor);
    // cada claim RPC no canteiro podia somar varios segundos antes da gravacao.
    setGravandoAtendimento(true);

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
      setGravandoAtendimento(false);
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

    // Seed da UI (desenhos do leitor ja na memoria) — sem isto o Confirmar re-busca cada desenho.
    const docIdsSessao = [...new Set(sessaoRetirada.map((l) => l.documentoId))];
    const documentosSeed = docIdsSessao
      .map((id) => documentos.find((d) => d.id === id))
      .filter((d): d is AtendimentoDocumento => d != null)
      .map(documentoSeedFromUi);

    try {
    // Cursor em fundo — prepare resolve sozinho se ainda estiver frio.
    void aquecerBaselineAtendimentoNuvem();
    const tReg0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
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
      documentosSeed,
    });
    if (typeof console !== 'undefined' && console.info) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      console.info(
        `[atendimento] confirmar_sessao total=${Math.round(now - tConfirm0)}ms ` +
          `registro=${Math.round(now - tReg0)}ms seed=${documentosSeed.length}/${docIdsSessao.length}`,
      );
    }

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

    // Atualizacao incremental (igual ao estorno): nao esperar load() completo — em obra grande
    // isso acrescentava 20–40s depois da gravacao ja concluida.
    const novos = result.data;
    const qtdPorLinha = new Map<string, number>();
    for (const at of novos) {
      for (const it of at.itens) {
        const k = `${at.documentoId}::${it.documentoItemId}`;
        qtdPorLinha.set(k, (qtdPorLinha.get(k) ?? 0) + (Number(it.quantidadeAtendida) || 0));
      }
    }
    const aplicarBaixasDocs = (docs: AtendimentoDocumento[]) =>
      docs.map((doc) => {
        let mudou = false;
        const linhas = doc.linhas.map((linha) => {
          const add = qtdPorLinha.get(`${doc.id}::${linha.documentoItemId}`);
          if (!add) return linha;
          mudou = true;
          return {
            ...linha,
            quantidadeAtendida: (Number(linha.quantidadeAtendida) || 0) + add,
          };
        });
        return mudou ? { ...doc, linhas } : doc;
      });

    setHistorico((prev) => [...novos, ...prev].slice(0, ATENDIMENTO_HISTORICO_PAGE_SIZE));
    setHistoricoTotalCount((prev) => prev + novos.length);
    setDocumentos((prev) => aplicarBaixasDocs(prev));
    queryClient.setQueryData(
      atendimentoCoreQueryKey(user?.login),
      (prev: AtendimentoCorePayload | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          documentos: aplicarBaixasDocs(prev.documentos),
        };
      },
    );
    if (historicoArquivoAtivo && historicoPage === 1) {
      queryClient.setQueryData(
        atendimentoHistoricoQueryKey(
          user?.login,
          historicoPage,
          ATENDIMENTO_HISTORICO_PAGE_SIZE,
          historicoBuscaDebounced,
          historicoPeriodo,
        ),
        (prev: HistoricoQueryData | undefined) => prependHistoricoCache(prev, novos, ATENDIMENTO_HISTORICO_PAGE_SIZE),
      );
    } else {
      void queryClient.removeQueries({ queryKey: ['atendimento', 'historico'] });
    }

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
    // Revalidacao leve em fundo — nao bloqueia o recibo.
    void load({ silent: true });

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
    leitorBuscaSeqRef.current += 1;
    setLeitorPainel(null);
  }, [setLeitorPainel]);

  const processarLeituraCodigoBarras = useCallback(
    async (scanRaw: string) => {
      const scan = scanRaw.trim();
      if (!scan) return;
      if (!canAccessAction('atendimento', 'editar')) {
        setError('Seu perfil nao possui permissao para registrar atendimento.');
        return;
      }
      if (documentoLockBloqueadoRef.current) {
        tocarFeedbackLeitor('erro');
        setError(
          documentoLockAviso ||
            'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
        );
        return;
      }
      setError('');
      setSuccess('');
      // Feedback imediato: modal abre ja no passo «buscando» enquanto consultamos a nuvem.
      // Se o usuario fechar o modal durante a busca, o resultado tardio nao pode reabri-lo.
      const buscaId = ++leitorBuscaSeqRef.current;
      const buscaAtiva = () => leitorBuscaSeqRef.current === buscaId;
      setLeitorPainel({ scan, material: null, candidatos: [], passo: 'buscando' });

      const matRes = await buscarMaterialPorLeituraCodigo(scan);
      if (!matRes.success) {
        if (buscaAtiva()) setLeitorPainel(null);
        tocarFeedbackLeitor('erro');
        setError(matRes.error ?? 'Falha ao buscar material.');
        return;
      }
      if (!matRes.data) {
        if (buscaAtiva()) setLeitorPainel(null);
        tocarFeedbackLeitor('erro');
        setError('Material nao encontrado no cadastro (codigo ou codigo de barras).');
        return;
      }
      const material = matRes.data;
      // Material identificado — o modal ja mostra codigo/descricao enquanto procura desenhos.
      if (buscaAtiva()) setLeitorPainel({ scan, material, candidatos: [], passo: 'buscando' });
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

      if (!buscaAtiva()) return;
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
    [documentos, sessaoRetirada, canAccessAction, setDocumentos, documentoLockAviso],
  );

  const fecharLeitorPainel = useCallback(() => {
    leitorBuscaSeqRef.current += 1;
    setLeitorPainel(null);
  }, [setLeitorPainel]);

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
      if (documentoLockBloqueadoRef.current) {
        setError(
          documentoLockAviso ||
            'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
        );
        return;
      }
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
        return current;
      });
    },
    [documentoLockAviso, selectedDocumentoId, setDocumentos],
  );

  function updateLinha(lineId: string, quantidadeNestaOperacao: number) {
    if (documentoLockBloqueadoRef.current) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
      return;
    }
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

  /** Atalho parcial: preenche o teto (min pendente, saldo) na linha. */
  function preencherMaximoLinha(lineId: string) {
    if (documentoLockBloqueadoRef.current) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
      return;
    }
    setIdsMarcados((prev) => new Set([...prev, lineId]));
    setDocumentos((current) =>
      current.map((doc) =>
        doc.id !== selectedDocumentoId
          ? doc
          : {
              ...doc,
              linhas: doc.linhas.map((linha) =>
                linha.documentoItemId === lineId
                  ? { ...linha, quantidadeNestaOperacao: quantidadeMaximaAtendimentoLinha(linha) }
                  : linha,
              ),
            },
      ),
    );
  }

  /** Preenche o teto em todas as linhas marcadas (atendimento total rapido). */
  function preencherMaximosMarcados() {
    if (documentoLockBloqueadoRef.current) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
      return;
    }
    setDocumentos((current) =>
      current.map((doc) => {
        if (doc.id !== selectedDocumentoId) return doc;
        return {
          ...doc,
          linhas: doc.linhas.map((linha) =>
            idsMarcados.has(linha.documentoItemId)
              ? { ...linha, quantidadeNestaOperacao: quantidadeMaximaAtendimentoLinha(linha) }
              : linha,
          ),
        };
      }),
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
    if (documentoLockBloqueado) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
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

    // Aquece cursor OCC enquanto o utilizador le o modal — Confirmar evita leitura fria de 25s.
    void aquecerBaselineAtendimentoNuvem();

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

    if (documentoLockBloqueado) {
      setError(
        documentoLockAviso ||
          'Desenho em uso por outro posto. Atendimento bloqueado neste documento.',
      );
      setConfirmacaoAtendimento(null);
      return;
    }

    const login = (user?.login ?? '').trim();
    if (login) {
      const claim = await claimAtendimentoDocumentoLock({
        documentoId: selectedDocumento.id,
        holderLogin: login,
        holderLabel: (user?.nome ?? login).trim(),
        ttlSeconds: 120,
      });
      if (isAtendimentoLockHeldByOther(claim)) {
        const msg = mensagemAtendimentoLockBloqueado(claim);
        setDocumentoLockAviso(msg);
        setDocumentoLockBloqueado(true);
        documentoLockBloqueadoRef.current = true;
        setError(msg);
        setConfirmacaoAtendimento(null);
        return;
      }
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
      setConfirmacaoAtendimento(null);
      return;
    }

    const itens = itensSelecionados.map((linha) => ({
      documentoItemId: linha.documentoItemId,
      quantidade: linha.quantidadeNestaOperacao,
    }));

    // Mantem o modal aberto com indicador de progresso ate a nuvem confirmar.
    setGravandoAtendimento(true);
    try {
    // Cursor ja costuma estar quente; nao bloquear Confirmar se faltar (prepare resolve em <3s).
    void aquecerBaselineAtendimentoNuvem();
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
      documentosSeed: [
        documentoSeedFromUi(selectedDocumento),
      ],
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
    if (result.data) {
      const novo = result.data;
      setHistorico((prev) => [novo, ...prev.filter((a) => a.id !== novo.id)].slice(0, ATENDIMENTO_HISTORICO_PAGE_SIZE));
      setHistoricoTotalCount((prev) => (prev > 0 ? prev + 1 : prev));
      // Optimistic so na pagina 1; senao invalida para nao mostrar lista incompleta.
      if (historicoArquivoAtivo && historicoPage === 1) {
        queryClient.setQueryData(
          atendimentoHistoricoQueryKey(
            user?.login,
            historicoPage,
            ATENDIMENTO_HISTORICO_PAGE_SIZE,
            historicoBuscaDebounced,
            historicoPeriodo,
          ),
          (prev: HistoricoQueryData | undefined) => prependHistoricoCache(prev, [novo], ATENDIMENTO_HISTORICO_PAGE_SIZE),
        );
      } else {
        void queryClient.removeQueries({ queryKey: ['atendimento', 'historico'] });
      }
    }
    setRecebedorTipo('interno');
    setRecebedorColaboradorId('');
    setRecebedor('');
    setRecebedorEmpresa('');
    setRecebedorDocumento('');
    setRecebedorTelefone('');
    setAutorizadorInterno('');
    setMotivoRetirada('');
    setSelectedDocumentoId('');
    // Revalidacao em fundo — nao bloquear o recibo apos a nuvem ja ter confirmado.
    void load({ silent: true });
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
        return { ...prev, documentos: aplicarDeltasDocs(prev.documentos) };
      },
    );
    queryClient.setQueryData(
      atendimentoHistoricoQueryKey(
        user?.login,
        historicoPage,
        ATENDIMENTO_HISTORICO_PAGE_SIZE,
        historicoBuscaDebounced,
        historicoPeriodo,
      ),
      (prev: HistoricoQueryData | undefined) => {
        if (!prev) return prev;
        const hist = [...prev.items];
        const idx = hist.findIndex((a) => a.id === atualizado.id || a.numero === atualizado.numero);
        if (idx === -1) hist.unshift(atualizado);
        else hist[idx] = atualizado;
        return { ...prev, items: hist.slice(0, ATENDIMENTO_HISTORICO_PAGE_SIZE) };
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
    historicoTotalCount,
    historicoPage,
    setHistoricoPage,
    historicoBusca,
    setHistoricoBusca: setHistoricoBuscaFiltro,
    historicoPeriodo,
    setHistoricoPeriodo: setHistoricoPeriodoFiltro,
    historicoLoading,
    historicoFetchError,
    historicoArquivoAtivo,
    ensureHistoricoCarregado,
    recarregarHistorico,
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
    documentoLockAviso,
    documentoLockBloqueado,
    fallbackReason,
    listSource,
    hasCloudConfig,
    load,
    adicionarDocumentoPendenteRemoto,
    setSelectedDocumentoId: selecionarDocumentoId,
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
    preencherMaximoLinha,
    preencherMaximosMarcados,
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
    exportarEstornosExcel,
    exportingRelatorio,
    exportingAtendimentosCsv: exportingRelatorio === 'atendimentos',
    exportingEstornosCsv: exportingRelatorio === 'estornos',
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
