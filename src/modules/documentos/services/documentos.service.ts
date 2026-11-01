import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import {
  avisarPreservacaoLocalStorageCorrupto,
  notificarReparacaoLocalStorage,
} from '../../../lib/localStoragePreservacao';
import { extrairCodigoMaterialDeObjetoImport } from '../../../lib/codigoMaterialImport';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { parseDocumentosImportJsonRoot } from '../../../lib/schemas/importArquivoPlano.zod';
import { readRemoteOrLocal, REMOTE_READ_TIMEOUT_MS, shouldTryRemoteRead } from '../../../lib/dataReadPolicy';
import {
  getSupabase,
  hasSupabaseConfig,
  restGetSemFilaAuth,
  rpcComJwtSemFila,
  rpcSemFilaAuth,
} from '../../../lib/supabase';
import {
  contarRegistosArrayLocalStorage,
  mensagemSeSubstituirLocalPerderiaCadastros,
} from '../../../lib/localSnapshotWriteGuard';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { getCurrentUser } from '../../auth/services/auth.service';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import { listarMateriais, validarCodigosMateriaisAtivosNoCadastroParaRecebimento, carregarMateriaisDoCadastro } from '../../materiais/services/materiais.service';
import { assertNoSilentSotFallback } from '../../../lib/sotWriteGuard';
import {
  invalidateIsoProSnapshotCache,
  isIsoProSnapshotConflictError,
  readIsoProSnapshotSlicesForWrite,
  SNAPSHOT_PLANEJAMENTO_SLICE_KEYS,
  SNAPSHOT_SALDO_SLICE_KEYS,
} from '../../../lib/isoProSnapshot';
import { readSnapshotRemoteSliceOrFull } from '../../../lib/snapshotSliceRead';
import { buildSaldoMap, codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import {
  countDocumentosPlanejamentoTabelas,
  listAllDocumentosPlanejamentoCompletosFromCloud,
  listAllDocumentosPlanejamentoIndiceFromCloud,
  listDocumentosPlanejamentoPageFromCloud,
  listDocumentosPlanejamentoIdsFromCloud,
  listExportDocumentosItensRowsFromCloud,
  listExportDocumentosCsvFinalFromCloud,
  readDocumentoPlanejamentoFromCloud,
  upsertDocumentosPlanejamentoEmLotes,
  writeDocumentosSotOnCloud,
} from '../../../lib/documentosPlanejamentoTabelas';
import {
  fetchLocalizacoesRecebimentoPorCodigo,
  fetchMetricasPlanejamentoPorCodigo,
  fetchQuantidadeRecebidaPorCodigo,
} from '../../../lib/operacaoEscalaContagens';
import { ensureIsoProDataSessionReadable } from '../../../lib/isoProJwtSession';
import { fetchAllExportRpcPages } from '../../../lib/exportRpcPages';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { parseDecimalFlexible, roundPesoKg } from '../../../lib/parseDecimal';
import { executeWrite, getErrorMessage } from '../../../lib/service-result';
import { MSG_ERRO_LEITURA_NUVEM, traduzirErroOperacionalIsoPro } from '../../../lib/traduzirErroOperacionalIsoPro';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { validateDocumento } from '../schemas/documento.schema';
import { parseDocumentosPersistidos } from '../schemas/documentoPersistido.zod';
import type {
  Documento,
  DocumentoFiltro,
  DocumentoFormData,
  DocumentoItem,
  DocumentoListItem,
  DocumentosArquivoExportacao,
  DocumentosImportacaoResumo,
} from '../types/documento.types';
import { listarDocumentosComAtendimentoVinculado } from '../../atendimento/services/atendimento.service';
import {
  construirJsonImportacaoDocumentosPlanoCsv,
  extrairChavesDocumentosDoCsv,
  extrairDescricoesDocumentosDoCsv,
  previewImportacaoDocumentosCsv,
} from './documentos.import.csv';
import {
  coletarRevisoesActivasOutrasParaChaves,
  listarRevisoesActivasOutrasDoNumero,
  motivoCancelamentoSubstituidoPorRevisao,
  type RevisaoActivaOutra,
} from '../utils/documentoRevisoesAntigas';
import { imprimirPlanejamentoCampoHtml } from '../utils/imprimirPlanejamentoCampoHtml';
import { preservarAtendimentoNosItens } from '../utils/preservarAtendimentoNosItens';
import {
  aplicarStatusPlanejamentoEmDocumentos,
  fundirMetricasPlanejamento,
  metricasSementeDoDocumento,
  montarLocalizacoesPorCodigoMaterial,
  montarMetricasPorCodigoMaterial,
  normalizeCodigoPlanejamento,
  resolverLocalizacaoExibicaoPlanejamento,
  resolverStatusDocumentoPlanejamento,
  resolverStatusLinhaDocumento,
  type MetricasPorCodigoMaterial,
} from './documentoPlanejamento';

export { fundirMetricasPlanejamento, metricasSementeDoDocumento };
import {
  documentosReconciliadosDoPayload,
  montarSaldoPayloadComDocumentosReconciliados,
  type PayloadPlanejamentoReconcile,
} from '../../../lib/snapshotDocumentosReconciliacao';
import {
  limparRefsAtendimentoIncompativeisComPlanejamento,
  mensagemSePlanejamentoIncompativelComRefsAtendimento,
  type PayloadComRefsAtendimento,
} from '../../../lib/snapshotDocumentosPlanejamentoIntegrity';
import {
  IMPORT_COOPERATIVE_MIN_CSV_ROWS,
  yieldCooperativeEveryRows,
  yieldToMain,
} from '../../../lib/yieldCooperativeImport';
import { registerSnapshotDerivedCacheInvalidator } from '../../../lib/snapshotDerivedCache';

export { previewImportacaoDocumentosCsv, extrairDescricoesDocumentosDoCsv };

/** Pré-visualização local do CSV. Não lê a nuvem — a caixa de confirmação abre na hora. */
export function previewImportacaoDocumentosComRevisoesAntigas(text: string):
  | { ok: true; linhaCount: number; revisoesAntigasActivas: RevisaoActivaOutra[] }
  | { ok: false; error: string } {
  const preview = previewImportacaoDocumentosCsv(text);
  if (!preview.ok) return preview;
  return { ok: true, linhaCount: preview.linhaCount, revisoesAntigasActivas: [] };
}

/** Aviso de revisões antigas, em segundo plano, depois da confirmação já estar na tela. */
export async function carregarRevisoesAntigasActivasDoCsvImportacao(text: string): Promise<RevisaoActivaOutra[]> {
  const chaves = extrairChavesDocumentosDoCsv(text);
  if (!chaves.length || !hasSupabaseConfig()) return [];
  const indice = await listAllDocumentosPlanejamentoIndiceFromCloud();
  if (indice.error) return [];
  const existentes = indice.documentos.map((d) => ({
    id: d.id,
    numero: d.numero,
    revisao: d.revisao,
    status: statusDocumentoListaSeguro(d.status),
  }));
  return coletarRevisoesActivasOutrasParaChaves(existentes, chaves);
}

/** Aviso antes de gravar (criar novo ou outro id): outras revisões activas do mesmo número. */
export async function previewRevisoesActivasOutrasAoSalvar(
  numero: string,
  revisao: string,
  excludeId?: string | null,
): Promise<RevisaoActivaOutra[]> {
  const existentes = await loadDocumentos();
  return listarRevisoesActivasOutrasDoNumero(existentes, numero, revisao, excludeId);
}

type PlanejamentoDocumentosBundle = {
  documentos: Documento[];
  recebimentos: Awaited<ReturnType<typeof carregarRecebimentosCompletos>>;
  enriched: Documento[];
  metricas: Map<string, MetricasPorCodigoMaterial>;
  localizacoesRecebimentoPorCodigo: Map<string, string>;
};

let planejamentoBundleCache: PlanejamentoDocumentosBundle | null = null;
let planejamentoBundleInflight: Promise<PlanejamentoDocumentosBundle> | null = null;

function invalidatePlanejamentoDocumentosBundle(): void {
  planejamentoBundleCache = null;
  planejamentoBundleInflight = null;
}

registerSnapshotDerivedCacheInvalidator(invalidatePlanejamentoDocumentosBundle);

/** Uma leitura partilhada (documentos + recebimentos + metricas) — evita recarregar tudo em cada «Visualizar». */
async function obterBundlePlanejamentoDocumentos(): Promise<PlanejamentoDocumentosBundle> {
  if (planejamentoBundleCache) return planejamentoBundleCache;
  if (planejamentoBundleInflight) return planejamentoBundleInflight;

  planejamentoBundleInflight = (async () => {
    const { data: documentos } = await carregarDocumentosBase();
    const recebimentos = await carregarRecebimentosCompletos();
    const enriched = aplicarStatusPlanejamentoEmDocumentos(documentos, recebimentos);
    const bundle: PlanejamentoDocumentosBundle = {
      documentos,
      recebimentos,
      enriched,
      metricas: montarMetricasPorCodigoMaterial(documentos, recebimentos),
      localizacoesRecebimentoPorCodigo: montarLocalizacoesPorCodigoMaterial(recebimentos),
    };
    planejamentoBundleCache = bundle;
    return bundle;
  })();

  try {
    return await planejamentoBundleInflight;
  } finally {
    planejamentoBundleInflight = null;
  }
}

function formatarErroExclusaoBloqueadaPorAtendimento(
  items: Awaited<ReturnType<typeof listarDocumentosComAtendimentoVinculado>>,
): string {
  const max = 12;
  const slice = items.slice(0, max);
  const linhas = slice.map((i) => {
    const amostra =
      i.exemplosLotes.length > 0
        ? ` Ex.: ${i.exemplosLotes.slice(0, 3).join(', ')}${i.exemplosLotes.length > 3 ? '…' : ''}`
        : '';
    return `- ${i.rotulo} (${i.atendimentosCount} registro(s) de atendimento)` + amostra;
  });
  const extra = items.length > max ? `\n… e mais ${items.length - max} documento(s) com atendimento.` : '';
  return `Nao e possivel excluir: existe(m) atendimento(s) ligado(s) a estes documentos no modulo Atendimento. Estorne os lotes ou regularize antes de apagar.\n${linhas.join('\n')}${extra}`;
}

function documentosStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-documentos');
}

const DICA_ALINHAMENTO_DOCUMENTOS_NUVEM =
  'Use primeiro "Enviar planejamento deste PC para a nuvem" na lista de documentos, ou alinhe o planejamento, e volte a tentar.';

function bloqueioSubstituicaoLocalDocumentos(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros(
    [
      {
        storageKey: documentosStorageKey(),
        tamanhoNovaLista: tamanhoListaGravacao,
        nomeCurto: 'documento(s)',
        substantivoRemovidos: 'desenho(s)',
      },
    ],
    DICA_ALINHAMENTO_DOCUMENTOS_NUVEM,
  );
}

const seedData: Documento[] = [
  {
    id: 'doc-1',
    numero: 'DOC-1001',
    revisao: 'A',
    descricao: 'Planejamento de tubulacao area norte',
    responsavel: 'Eng. Roberto',
    dataDocumento: '2026-04-01',
    status: 'parcial',
    observacao: '',
    itens: [
      {
        id: 'doc-1-item-1',
        codigoMaterial: 'TB-0001',
        descricaoMaterial: 'Tubo inox 2 polegadas',
        unidade: 'UN',
        quantidadeProjeto: 20,
        quantidadeAtendida: 12,
        localizacao: 'Almox. tubos — Corredor A / Prateleira 12',
      },
      {
        id: 'doc-1-item-2',
        codigoMaterial: 'EL-0102',
        descricaoMaterial: 'Cabo eletrico 10mm',
        unidade: 'M',
        quantidadeProjeto: 200,
        quantidadeAtendida: 0,
        localizacao: '',
      },
    ],
  },
  {
    id: 'doc-2',
    numero: 'DOC-1002',
    revisao: 'B',
    descricao: 'Estruturas secundarias da area de montagem',
    responsavel: 'Tec. Mariana',
    dataDocumento: '2026-04-02',
    status: 'pendente',
    observacao: '',
    itens: [
      {
        id: 'doc-2-item-1',
        codigoMaterial: 'MT-0020',
        descricaoMaterial: 'Perfil metalico estrutural',
        unidade: 'BR',
        quantidadeProjeto: 8,
        quantidadeAtendida: 0,
        localizacao: '',
      },
    ],
  },
];

export const DOCUMENTOS_EXPORT_SCHEMA_VERSION = 1;

/** Opcional: motivo obrigatorio no servico quando status != pendente. */
export type CancelarDocumentoOpcoes = {
  motivoAdministrativo?: string;
  actorLogin?: string;
};

const MOTIVO_CANCELAMENTO_DOC_MIN_LEN = 15;

function validarCancelamentoDocumento(
  statusComputado: Documento['status'],
  opcoes?: CancelarDocumentoOpcoes,
): string | null {
  if (statusComputado === 'cancelado') {
    return 'Documento ja cancelado.';
  }
  if (statusComputado !== 'pendente') {
    const motivo = opcoes?.motivoAdministrativo?.trim() ?? '';
    if (motivo.length < MOTIVO_CANCELAMENTO_DOC_MIN_LEN) {
      return `Cancelamento administrativo exige justificativa com pelo menos ${MOTIVO_CANCELAMENTO_DOC_MIN_LEN} caracteres. Operacoes de recebimento e atendimento ja registradas no sistema nao sao estornadas por este comando — apenas o planejamento deixa de valer.`;
    }
  }
  return null;
}

function auditarCancelamentoDocumento(
  doc: Documento,
  statusAnterior: Documento['status'],
  opcoes?: CancelarDocumentoOpcoes,
) {
  const motivoTrim = opcoes?.motivoAdministrativo?.trim() ?? '';
  appendAuthAuditEvent({
    type: 'documento_cancelado',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail:
      statusAnterior === 'pendente'
        ? `Documento ${doc.numero} rev. ${doc.revisao} cancelado (estava pendente).`
        : `Documento ${doc.numero} rev. ${doc.revisao} cancelado por administracao. Status anterior: ${statusAnterior}. Motivo: ${motivoTrim}.`,
    entityType: 'documento',
    entityId: doc.id,
    before: { status: statusAnterior, numero: doc.numero, revisao: doc.revisao },
    after: { status: doc.status, numero: doc.numero, revisao: doc.revisao },
  });
}

function resumoAuditoriaDocumento(
  doc: Pick<Documento, 'id' | 'numero' | 'revisao' | 'descricao' | 'responsavel' | 'dataDocumento' | 'status' | 'itens'>,
) {
  return {
    id: doc.id,
    numero: doc.numero,
    revisao: doc.revisao,
    descricao: doc.descricao,
    responsavel: doc.responsavel,
    dataDocumento: doc.dataDocumento,
    status: doc.status,
    totalItens: doc.itens?.length ?? 0,
    quantidadePlanejada: (doc.itens ?? []).reduce((s, it) => s + (Number(it.quantidadeProjeto) || 0), 0),
    quantidadeAtendida: (doc.itens ?? []).reduce((s, it) => s + (Number(it.quantidadeAtendida) || 0), 0),
  };
}

function auditarDocumentoSalvo(before: Documento | undefined, after: Documento, actorLogin?: string) {
  const actor = actorLogin?.trim() || getCurrentUser()?.login?.trim() || 'desconhecido';
  if (before) {
    appendAuthAuditEvent({
      type: 'documento_editado',
      actorLogin: actor,
      detail: `Documento editado ${after.numero} rev. ${after.revisao}`,
      entityType: 'documento',
      entityId: after.id,
      before: resumoAuditoriaDocumento(before),
      after: resumoAuditoriaDocumento(after),
    });
    return;
  }
  appendAuthAuditEvent({
    type: 'documento_criado',
    actorLogin: actor,
    detail: `Documento criado ${after.numero} rev. ${after.revisao} · ${after.itens?.length ?? 0} item(ns)`,
    entityType: 'documento',
    entityId: after.id,
    after: resumoAuditoriaDocumento(after),
  });
}

export type ExcluirDocumentoDefinitivamenteOpcoes = {
  actorLogin?: string;
};

function auditarExclusaoDefinitivaDocumento(doc: Pick<Documento, 'numero' | 'revisao'>, opcoes?: ExcluirDocumentoDefinitivamenteOpcoes) {
  appendAuthAuditEvent({
    type: 'documento_excluido_definitivamente',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Documento ${doc.numero} rev. ${doc.revisao} excluido definitivamente do planejamento (linha removida).`,
  });
}

function auditarExclusaoDefinitivaDocumentosVarios(removidos: Documento[], opcoes?: ExcluirDocumentoDefinitivamenteOpcoes) {
  if (removidos.length === 1) {
    auditarExclusaoDefinitivaDocumento(removidos[0], opcoes);
    return;
  }
  appendAuthAuditEvent({
    type: 'documentos_excluidos_definitivamente',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Excluidos ${removidos.length} documento(s). Amostra: ${removidos
      .slice(0, 35)
      .map((d) => `${d.numero} rev.${d.revisao}`)
      .join('; ')}${removidos.length > 35 ? '...' : ''}`,
  });
}

/** Placeholder ao hidratar snapshot sem recebimentos; listagem e gravação recalculam com estoque. */
function deriveStatusSnapshot(doc: DocumentoFormData): Documento['status'] {
  const total = doc.itens.length;
  const atendidos = doc.itens.filter((item) => item.quantidadeAtendida >= item.quantidadeProjeto).length;
  const pendentes = doc.itens.filter((item) => item.quantidadeAtendida <= 0).length;

  if (!total || pendentes === total) return 'pendente';
  if (atendidos === total) return 'atendido';
  return 'parcial';
}

function readAll(): Documento[] {
  const key = documentosStorageKey();
  const raw = localStorage.getItem(key);
  if (!raw) {
    // Com nuvem: lista vazia local — a hidratação vem do snapshot (evita seed de demo na obra).
    if (hasSupabaseConfig()) return [];
    localStorage.setItem(key, JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseDocumentosPersistidos(parsed);
    if (!validated) {
      // Auto-limpa a chave inválida para o aviso não voltar em loop a cada F5.
      try {
        localStorage.removeItem(key);
        notificarReparacaoLocalStorage(key);
        console.warn(
          `[I.S.O PRO] Documentos (planejamento) — cache local inválido em "${key}" foi limpo automaticamente. A lista volta da nuvem.`,
        );
      } catch {
        avisarPreservacaoLocalStorageCorrupto(
          'Documentos (planejamento)',
          key,
          'Não foi possível limpar o cache local automaticamente.',
        );
      }
      return [];
    }
    return validated;
  } catch {
    try {
      localStorage.removeItem(key);
      notificarReparacaoLocalStorage(key);
      console.warn(
        `[I.S.O PRO] Documentos (planejamento) — JSON ilegível em "${key}" foi limpo automaticamente.`,
      );
    } catch {
      avisarPreservacaoLocalStorageCorrupto('Documentos (planejamento)', key);
    }
    return [];
  }
}

function writeAll(items: Documento[]) {
  const key = documentosStorageKey();
  try {
    localStorage.setItem(key, JSON.stringify(items));
    notificarReparacaoLocalStorage(key);
  } catch (err) {
    // Obra com milhares de desenhos: quota ~5 MB do browser. Não deixar lixo — SoT é a nuvem.
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    notificarReparacaoLocalStorage(key);
    if (!isQuota) {
      console.warn('[I.S.O PRO] Falha ao gravar documentos no localStorage:', err);
    } else {
      console.warn(
        '[I.S.O PRO] Cache local de documentos demasiado grande (quota). A operar só com a nuvem neste browser.',
      );
    }
  }
  invalidatePlanejamentoDocumentosBundle();
}

async function loadDocumentos(): Promise<Documento[]> {
  const base = await readRemoteOrLocal({
    readRemote: readSnapshotDocumentos,
    readLocal: readAll,
    // Sem corrida de 450ms aqui: este caminho alimenta baselines de gravacao e o bundle de
    // visualizacao/folha de campo. Num browser novo a copia local esta vazia e "ganhar a corrida"
    // esconderia desenhos/localizacoes reais da nuvem (regressao vista em 18/07/2026).
    preferMs: REMOTE_READ_TIMEOUT_MS,
  });
  return persistirLimpezaItensSemCadastroMaterial(base);
}

/**
 * Baseline da importacao: com nuvem configurada, le SEMPRE o snapshot remoto — sem fallback local.
 * Usar a copia local como base (ex.: seed demo num posto novo, ou sessao com leitura falhada) faria a
 * gravacao substituir o planejamento da nuvem pela copia errada e apagar os desenhos existentes
 * (incidente de 12/07/2026). Falha de leitura => importacao cancelada, nada e alterado.
 *
 * Preferir `carregarIndiceDocumentosParaImportacao` no fluxo normal (rápido). Este caminho completo
 * fica para «substituir e limpar historico» (precisa do catalogo inteiro no SoT rewrite).
 */
async function carregarDocumentosBaselineParaImportacao(): Promise<Documento[]> {
  if (!hasSupabaseConfig()) return readAll();
  try {
    return await readSnapshotDocumentos();
  } catch (error) {
    throw new Error(
      'Nao foi possivel ler o planejamento atual da nuvem — importacao cancelada por seguranca (nenhum dado foi alterado). ' +
        `Verifique a ligacao e a sessao, recarregue a pagina e tente novamente. Detalhe: ${getErrorMessage(error, 'erro de leitura da nuvem')}`,
    );
  }
}

type DocumentoIndiceImport = Pick<Documento, 'id' | 'numero' | 'revisao' | 'status'>;

/** Índice id/numero/revisao/status sem itens — baseline rápido (~4k linhas leves). */
async function carregarIndiceDocumentosParaImportacao(): Promise<DocumentoIndiceImport[]> {
  if (!hasSupabaseConfig()) {
    return readAll().map((d) => ({
      id: d.id,
      numero: d.numero,
      revisao: d.revisao,
      status: d.status,
    }));
  }
  const indice = await listAllDocumentosPlanejamentoIndiceFromCloud();
  if (indice.error) {
    throw new Error(
      'Nao foi possivel ler o indice do planejamento na nuvem — importacao cancelada por seguranca. ' +
        `Detalhe: ${indice.error}`,
    );
  }
  return indice.documentos.map((d) => ({
    id: d.id,
    numero: d.numero,
    revisao: d.revisao,
    status: statusDocumentoListaSeguro(d.status),
  }));
}

/**
 * Import normal: upsert só dos desenhos alterados (sem DELETE+reinsert dos ~4k).
 * Evita 4+ minutos para 1 CSV de um desenho.
 */
async function writeDocumentosImportDeltaOnCloud(
  delta: Documento[],
  indiceNuvem: DocumentoIndiceImport[],
  opcoes?: { actorLogin?: string; onProgress?: (mensagem: string) => void },
): Promise<void> {
  if (!delta.length) return;

  const byId = new Map(indiceNuvem.map((d) => [String(d.id), { id: d.id, numero: d.numero }]));
  for (const d of delta) {
    byId.set(String(d.id), { id: d.id, numero: d.numero });
  }
  const nextDocsMin = [...byId.values()];

  // So as referencias de atendimento. O catalogo de desenhos ja esta no indice;
  // baixar a coluna documentos (milhares de itens) estourava o tempo e abortava a importacao.
  const { slices: refsAtendimento } = await readIsoProSnapshotSlicesForWrite([
    'atendimentos',
    'atendimentoHistorico',
    'atendimentoEstornoLog',
  ]);
  const integridade = mensagemSePlanejamentoIncompativelComRefsAtendimento(
    {
      ...refsAtendimento,
      documentos: indiceNuvem.map((d) => ({ id: d.id, numero: d.numero })),
    } as PayloadComRefsAtendimento,
    nextDocsMin,
  );
  if (integridade) {
    appendAuthAuditEvent({
      type: 'planejamento_gravacao_bloqueada_remocao_nuvem',
      actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
      detail: integridade,
    });
    throw new Error(integridade);
  }

  const upsert = await upsertDocumentosPlanejamentoEmLotes(documentosToPlanejamentoWire(delta), {
    onProgress: (lote, total) => opcoes?.onProgress?.(`A gravar lote ${lote} de ${total}…`),
  });
  if (!upsert.ok) {
    const detalhe = (upsert.error || 'Falha ao gravar desenhos importados na nuvem.').replace(/\s+/g, ' ').slice(0, 280);
    throw new Error(
      `Importacao nao concluida. ${detalhe} Atualize a pagina e confira o total antes de importar de novo.`,
    );
  }
  invalidateIsoProSnapshotCache();
}

function mesclarDeltaDocumentosNoLocalStorage(delta: Documento[]): void {
  const local = readAll();
  if (!local.length) {
    if (!hasSupabaseConfig()) {
      writeAll(delta);
      notificarReparacaoLocalStorage(documentosStorageKey());
    }
    // Web / posto so-nuvem: nao materializar o catalogo completo no localStorage.
    return;
  }
  const map = new Map(local.map((d) => [`${d.numero.trim().toLowerCase()}|${d.revisao.trim().toLowerCase()}`, d]));
  for (const d of delta) {
    map.set(`${d.numero.trim().toLowerCase()}|${d.revisao.trim().toLowerCase()}`, d);
  }
  writeAll([...map.values()]);
  notificarReparacaoLocalStorage(documentosStorageKey());
}

async function carregarDocumentosBase(): Promise<{
  data: Documento[];
  meta: NonNullable<ServiceResult<Documento[]>['meta']>;
}> {
  const data = await loadDocumentos();
  return {
    data,
    meta: { source: shouldTryRemoteRead() ? 'supabase' : 'local' },
  };
}

type SnapshotPayload = PayloadPlanejamentoReconcile & {
  documentos?: Array<{
    id?: string | number;
    numero?: string;
    revisao?: string;
    data?: string;
    descricao?: string;
    responsavel?: string;
    itens?: Array<{
      id?: string | number;
      codigo?: string;
      descricao?: string;
      unidade?: string;
      quantidade?: number;
      quantidadeAtendida?: number;
      /** Alinhado ao mobile e a `buildSaldoMap` — alguns snapshots gravam só snake_case. */
      quantidade_atendida?: number;
      localizacao?: string;
    }>;
  }>;
};

async function readSnapshotDocumentos(): Promise<Documento[]> {
  // Table-first SEMPRE: a coluna `documentos` do snapshot fica stale quando a gravacao
  // SoT escreve so nas tabelas (ex.: desenhos novos aparecem na lista paginada mas nao
  // no Excel). Antes so caiamos nas tabelas se o array do snapshot estivesse vazio —
  // com snapshot incompleto (ex.: 4090 vs 4143) a exportacao omitia docs como 50099.
  if (hasSupabaseConfig()) {
    const fromTables = await listAllDocumentosPlanejamentoCompletosFromCloud();
    if (fromTables.error) {
      // Continua para o snapshot abaixo (ultimo recurso).
      console.warn('[I.S.O PRO] Leitura tabelas planejamento falhou; a tentar snapshot.', fromTables.error);
    } else if (fromTables.documentos.length > 0) {
      return fromTables.documentos.map((wire) => documentoFromPlanejamentoWire(wire));
    }
  }

  const payload = await readSnapshotRemoteSliceOrFull<SnapshotPayload>(SNAPSHOT_PLANEJAMENTO_SLICE_KEYS);
  const rawDocs = payload.documentos ?? [];

  const reconciliados = documentosReconciliadosDoPayload(payload);
  const rawById = new Map(rawDocs.map((d, i) => [String(d.id ?? `doc-${i + 1}`), d]));

  return reconciliados.map((doc, index) => {
    const raw = rawById.get(doc.id) ?? rawDocs[index];
    const itens = doc.itens.map((item) => ({
      id: item.id,
      codigoMaterial: item.codigoMaterial,
      descricaoMaterial: item.descricaoMaterial,
      unidade: item.unidade,
      quantidadeProjeto: item.quantidadeProjeto,
      quantidadeAtendida: item.quantidadeAtendida,
      localizacao: (item.localizacao ?? '').trim(),
    }));

    const documentoBase: DocumentoFormData = {
      numero: doc.numero,
      revisao: doc.revisao,
      descricao: doc.descricao,
      responsavel: doc.responsavel,
      dataDocumento: String((raw as { data?: string })?.data ?? new Date().toISOString().slice(0, 10)),
      observacao: '',
      itens,
    };

    return {
      id: doc.id,
      ...documentoBase,
      status: deriveStatusSnapshot(documentoBase),
    };
  });
}

/** Quantidade de documentos guardados em `localStorage` neste navegador (chave `iso-pro-desktop-documentos`). */
export function contarDocumentosNoArmazenamentoLocal(): number {
  return contarRegistosArrayLocalStorage(documentosStorageKey());
}

function contarLinhasMaterialEmDocumentosSnapshot(
  documentos: Array<{ itens?: unknown }> | undefined,
): { comItens: number; totalItens: number } {
  let comItens = 0;
  let totalItens = 0;
  for (const doc of documentos ?? []) {
    const n = Array.isArray(doc.itens) ? doc.itens.length : 0;
    if (n > 0) {
      comItens += 1;
      totalItens += n;
    }
  }
  return { comItens, totalItens };
}

function contarLinhasMaterialNoArmazenamentoLocal(): { comItens: number; totalItens: number } {
  const items = readAll();
  let comItens = 0;
  let totalItens = 0;
  for (const doc of items) {
    const n = doc.itens?.length ?? 0;
    if (n > 0) {
      comItens += 1;
      totalItens += n;
    }
  }
  return { comItens, totalItens };
}

/**
 * Compara planejamento local vs snapshot remoto.
 * `nuvemSemLinhasMaterial` explica mobile com desenhos mas sem lista de materiais (cabecalhos sem itens[]).
 */
export async function diagnosticarPlanejamentoLocalVersusNuvem(): Promise<{
  noNavegador: number;
  noSnapshot: number;
  comItensNoLocal: number;
  totalItensNoLocal: number;
  comItensNaNuvem: number;
  totalItensNaNuvem: number;
  nuvemSemLinhasMaterial: boolean;
}> {
  const localItens = contarLinhasMaterialNoArmazenamentoLocal();
  const noNavegador = contarDocumentosNoArmazenamentoLocal();
  if (!hasSupabaseConfig()) {
    return {
      noNavegador,
      noSnapshot: -1,
      comItensNoLocal: localItens.comItens,
      totalItensNoLocal: localItens.totalItens,
      comItensNaNuvem: -1,
      totalItensNaNuvem: -1,
      nuvemSemLinhasMaterial: false,
    };
  }
  try {
    // Preferir contagens nas tabelas (rápido). O slice completo do snapshot pode ter
    // milhares de desenhos e bloquear a lista com "Carregando documentos...".
    const tabelas = await countDocumentosPlanejamentoTabelas();
    if (tabelas.ok) {
      const noSnapshot = tabelas.documentos;
      const nuvemSemLinhasMaterial =
        noSnapshot > 0 &&
        localItens.totalItens > 0 &&
        tabelas.itens < Math.max(5, Math.floor(localItens.totalItens * 0.02));
      return {
        noNavegador,
        noSnapshot,
        comItensNoLocal: localItens.comItens,
        totalItensNoLocal: localItens.totalItens,
        comItensNaNuvem: tabelas.documentosComItens,
        totalItensNaNuvem: tabelas.itens,
        nuvemSemLinhasMaterial,
      };
    }

    const payload = await readSnapshotRemoteSliceOrFull<SnapshotPayload>(SNAPSHOT_PLANEJAMENTO_SLICE_KEYS);
    const cloudItens = contarLinhasMaterialEmDocumentosSnapshot(payload.documentos);
    const noSnapshot = payload.documentos?.length ?? 0;
    const nuvemSemLinhasMaterial =
      noSnapshot > 0 &&
      localItens.totalItens > 0 &&
      cloudItens.totalItens < Math.max(5, Math.floor(localItens.totalItens * 0.02));
    return {
      noNavegador,
      noSnapshot,
      comItensNoLocal: localItens.comItens,
      totalItensNoLocal: localItens.totalItens,
      comItensNaNuvem: cloudItens.comItens,
      totalItensNaNuvem: cloudItens.totalItens,
      nuvemSemLinhasMaterial,
    };
  } catch {
    return {
      noNavegador,
      noSnapshot: -1,
      comItensNoLocal: localItens.comItens,
      totalItensNoLocal: localItens.totalItens,
      comItensNaNuvem: -1,
      totalItensNaNuvem: -1,
      nuvemSemLinhasMaterial: false,
    };
  }
}

/**
 * Substitui o array `documentos` no snapshot remoto pela copia deste navegador (`localStorage`).
 * Use quando o mobile nao ve desenhos: normalmente o PC esta em fallback local (consulta ao Supabase falhou) ou os dados nunca foram gravados na nuvem.
 * Apos gravar, rele o snapshot e confirma quantidade e IDs para o operador ter certeza de que a nuvem ficou alinhada.
 */
export async function sincronizarPlanejamentoLocalComNuvem(): Promise<ServiceResult<{ total: number; confirmadoNaNuvem: number }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const items = readAll();
  const localIds = new Set(items.map((d) => d.id));
  try {
    await writeSnapshotDocumentos(items, { substituicaoExplicitaDaNuvem: true });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao gravar planejamento na nuvem.',
    };
  }

  try {
    const naNuvem = await readSnapshotDocumentos();
    const cloudIds = new Set(naNuvem.map((d) => d.id));
    if (naNuvem.length !== items.length || ![...localIds].every((id) => cloudIds.has(id))) {
      return {
        success: false,
        error: `Gravacao foi enviada mas a verificacao na nuvem nao bateu: local ${items.length} documento(s), nuvem ${naNuvem.length} apos releitura. Confira permissoes/RLS em iso_pro_snapshot, conflitos de outra sessao, ou recarregue a pagina e tente de novo.`,
      };
    }
    const localItens = contarLinhasMaterialNoArmazenamentoLocal();
    const cloudItens = contarLinhasMaterialEmDocumentosSnapshot(naNuvem);
    if (localItens.totalItens > 0 && cloudItens.totalItens < Math.max(5, Math.floor(localItens.totalItens * 0.5))) {
      return {
        success: false,
        error: `Planejamento enviado mas a nuvem ficou sem linhas de material (${cloudItens.totalItens} linha(s) vs ${localItens.totalItens} neste PC). Recarregue a pagina e use novamente «Enviar planejamento deste PC para a nuvem».`,
      };
    }
    return { success: true, data: { total: items.length, confirmadoNaNuvem: naNuvem.length } };
  } catch (error) {
    return {
      success: false,
      error: `Gravacao pode ter sido aceite mas nao foi possivel reler o snapshot para confirmar: ${error instanceof Error ? error.message : 'erro desconhecido'}. Recarregue o planejamento ou verifique o Supabase.`,
    };
  }
}

/**
 * Guarda anti-perda: nenhuma gravacao de planejamento pode remover da nuvem mais desenhos
 * do que o fluxo declarou (`remocoesEsperadas`). Protege contra baseline errado no cliente
 * (fallback local/seed demo, sessao expirada) a substituir o planejamento real — incidente 12/07/2026.
 */
function mensagemSeGravacaoRemoveriaDesenhosDaNuvem(
  docsNuvem: Array<{ id?: unknown; numero?: unknown; revisao?: unknown }>,
  itens: Documento[],
  remocoesEsperadas: number,
): string | null {
  if (!docsNuvem.length) return null;
  const idsNext = new Set(itens.map((d) => String(d.id)));
  const chavesNext = new Set(itens.map((d) => `${d.numero.trim().toLowerCase()}|${d.revisao.trim().toLowerCase()}`));
  const emFalta = docsNuvem.filter((d) => {
    if (d.id !== undefined && idsNext.has(String(d.id))) return false;
    const chave = `${String(d.numero ?? '').trim().toLowerCase()}|${String(d.revisao ?? '').trim().toLowerCase()}`;
    return !chavesNext.has(chave);
  });
  if (emFalta.length <= remocoesEsperadas) return null;
  const exemplos = emFalta
    .slice(0, 5)
    .map((d) => `${String(d.numero ?? '?')} rev. ${String(d.revisao ?? '?')}`)
    .join(', ');
  return (
    `Gravacao bloqueada por seguranca: iria remover ${emFalta.length} desenho(s) que existem na nuvem e nao estao na lista a gravar` +
    (remocoesEsperadas > 0 ? ` (esperado no maximo ${remocoesEsperadas})` : '') +
    `. Ex.: ${exemplos}. Isto normalmente indica que este posto nao conseguiu ler o planejamento da nuvem antes de gravar. ` +
    'Recarregue a pagina (F5) e tente novamente. Nenhum dado foi alterado.'
  );
}

function documentosToPlanejamentoWire(items: Documento[]) {
  return items.map((item) => ({
    id: item.id,
    numero: item.numero,
    revisao: item.revisao,
    data: item.dataDocumento,
    descricao: item.descricao,
    responsavel: item.responsavel,
    // Coluna de escala / lista paginada; sem isto o sync restaura "pendente" stale.
    status: item.status,
    itens: item.itens.map((docItem) => ({
      id: docItem.id,
      codigo: docItem.codigoMaterial,
      descricao: docItem.descricaoMaterial,
      unidade: docItem.unidade,
      quantidade: docItem.quantidadeProjeto,
      quantidadeAtendida: docItem.quantidadeAtendida,
      localizacao: (docItem.localizacao ?? '').trim(),
    })),
  }));
}

/**
 * SoT table-first: `iso_pro_write_documentos_sot` (preserva qAt nas tabelas).
 * Sem fallback patch_snapshot (hard-fail sot_require_rpc).
 */
async function writeSnapshotDocumentos(
  items: Documento[],
  opcoes?: {
    dispensarValidacaoRefsAtendimento?: boolean;
    limparHistoricoIncompativel?: boolean;
    actorLogin?: string;
    /** Numero maximo de desenhos que este fluxo pode legitimamente remover da nuvem (ex.: exclusao explicita). */
    remocoesEsperadas?: number;
    /** Apenas para «Enviar planejamento deste PC para a nuvem» — substituicao explicita e consciente. */
    substituicaoExplicitaDaNuvem?: boolean;
  },
): Promise<void> {
  const maxAttempts = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { slices: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotSlicesForWrite(
        SNAPSHOT_PLANEJAMENTO_SLICE_KEYS,
      );
      let payloadTrabalho = currentPayload as PayloadComRefsAtendimento;
      let removidosHistorico = 0;
      let removidosAtendimentos = 0;

      if (!opcoes?.substituicaoExplicitaDaNuvem) {
        let docsNuvem = Array.isArray((currentPayload as { documentos?: unknown }).documentos)
          ? ((currentPayload as { documentos: Array<{ id?: unknown; numero?: unknown; revisao?: unknown }> }).documentos)
          : [];
        // Snapshot table-first pode omitir `documentos`; o anti-wipe precisa das tabelas.
        if (!docsNuvem.length) {
          const idsCloud = await listDocumentosPlanejamentoIdsFromCloud();
          if (idsCloud.error && idsCloud.source === 'error') {
            throw new Error(
              `Nao foi possivel validar o planejamento na nuvem antes de gravar: ${idsCloud.error}`,
            );
          }
          docsNuvem = idsCloud.ids.map((id) => ({ id }));
        }
        const bloqueio = mensagemSeGravacaoRemoveriaDesenhosDaNuvem(docsNuvem, items, opcoes?.remocoesEsperadas ?? 0);
        if (bloqueio) {
          appendAuthAuditEvent({
            type: 'planejamento_gravacao_bloqueada_remocao_nuvem',
            actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
            detail: bloqueio,
          });
          throw new Error(bloqueio);
        }
      }

      const nextDocsMin = items.map((d) => ({ id: d.id, numero: d.numero }));

      if (opcoes?.limparHistoricoIncompativel) {
        const limpo = limparRefsAtendimentoIncompativeisComPlanejamento(payloadTrabalho, nextDocsMin);
        payloadTrabalho = {
          ...payloadTrabalho,
          atendimentoHistorico: limpo.atendimentoHistorico,
          atendimentos: limpo.atendimentos,
        };
        removidosHistorico = limpo.removidosHistorico;
        removidosAtendimentos = limpo.removidosAtendimentos;
      }

      const integridade = mensagemSePlanejamentoIncompativelComRefsAtendimento(payloadTrabalho, nextDocsMin, {
        dispensarValidacao: opcoes?.dispensarValidacaoRefsAtendimento === true,
      });
      if (integridade) {
        throw new Error(integridade);
      }

      if (opcoes?.limparHistoricoIncompativel && (removidosHistorico > 0 || removidosAtendimentos > 0)) {
        appendAuthAuditEvent({
          type: 'planejamento_substituicao_limpou_historico',
          actorLogin: opcoes.actorLogin?.trim() || 'desconhecido',
          detail: `Substituicao de planejamento removeu ${removidosHistorico} linha(s) de atendimentoHistorico e ${removidosAtendimentos} atendimento(s) incompativeis com o novo planejamento.`,
        });
      }

      const documentosWire = documentosToPlanejamentoWire(items);
      const sot = await writeDocumentosSotOnCloud({
        documentos: documentosWire,
        baselineUpdatedAt,
        atendimentoHistorico: opcoes?.limparHistoricoIncompativel
          ? payloadTrabalho.atendimentoHistorico
          : undefined,
        atendimentos: opcoes?.limparHistoricoIncompativel ? payloadTrabalho.atendimentos : undefined,
      });
      assertNoSilentSotFallback('documentos', sot.missing);
      invalidateIsoProSnapshotCache();
      return;
    } catch (error) {
      lastError = error;
      if (isIsoProSnapshotConflictError(error) && attempt < maxAttempts - 1) {
        invalidateIsoProSnapshotCache();
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha ao gravar documentos na nuvem.');
}

function buildSearchText(item: Documento) {
  const locBlob = item.itens.map((i) => (i.localizacao ?? '').trim()).join(' ');
  return `${item.numero} ${item.descricao} ${item.responsavel} ${locBlob}`.toLowerCase();
}

/** Mesma regra de filtro da listagem (busca + status), sem paginacao. */
export function aplicarFiltrosListaDocumentos(
  items: Documento[],
  filtro: Pick<DocumentoFiltro, 'busca' | 'status'>,
): Documento[] {
  let result = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    result = result.filter((item) => buildSearchText(item).includes(busca));
  }
  if (filtro.status !== 'todos') {
    result = result.filter((item) => item.status === filtro.status);
  }
  return [...result].sort((a, b) => b.dataDocumento.localeCompare(a.dataDocumento) || a.numero.localeCompare(b.numero));
}

function toListItem(item: Documento): DocumentoListItem {
  const quantidadePlanejada = item.itens.reduce((total, current) => total + current.quantidadeProjeto, 0);
  const quantidadeAtendida = item.itens.reduce((total, current) => total + current.quantidadeAtendida, 0);

  return {
    id: item.id,
    numero: item.numero,
    revisao: item.revisao,
    descricao: item.descricao,
    responsavel: item.responsavel,
    dataDocumento: item.dataDocumento,
    status: item.status,
    totalItens: item.itens.length,
    quantidadePlanejada,
    quantidadeAtendida,
  };
}

function cancelarRevisoesActivasOutrasEmLista(
  items: Documento[],
  numero: string,
  revisaoManter: string,
  excludeId: string,
  actorLogin?: string,
): number {
  const antigas = listarRevisoesActivasOutrasDoNumero(items, numero, revisaoManter, excludeId);
  let n = 0;
  for (const antiga of antigas) {
    const idx = items.findIndex((d) => d.id === antiga.id);
    if (idx === -1 || items[idx].status === 'cancelado') continue;
    const statusAnterior = items[idx].status;
    const motivo = motivoCancelamentoSubstituidoPorRevisao(numero, revisaoManter);
    items[idx] = { ...items[idx], status: 'cancelado' };
    auditarCancelamentoDocumento(items[idx], statusAnterior, {
      motivoAdministrativo: motivo,
      actorLogin,
    });
    n += 1;
  }
  return n;
}

function statusDocumentoListaSeguro(raw: unknown): Documento['status'] {
  const statusRaw = String(raw ?? 'pendente');
  return (
    ['pendente', 'parcial', 'recebido', 'atendido', 'cancelado'].includes(statusRaw)
      ? statusRaw
      : 'pendente'
  ) as Documento['status'];
}

/**
 * Lista rápida (RPC) devolve a coluna `status`.
 * Só reforça Atendido quando as quantidades da página já cobrem o documento.
 */
function statusDocumentoListaComQuantidades(
  raw: unknown,
  quantidadePlanejada: number,
  quantidadeAtendida: number,
): Documento['status'] {
  const base = statusDocumentoListaSeguro(raw);
  if (base === 'cancelado') return 'cancelado';
  const qPlan = Number(quantidadePlanejada) || 0;
  const qAtd = Number(quantidadeAtendida) || 0;
  if (qPlan > 0 && qAtd + 1e-9 >= qPlan) return 'atendido';
  return base;
}

export async function listarDocumentos(
  filtro: DocumentoFiltro,
  opcoes?: { signal?: AbortSignal },
): Promise<ServiceResult<PaginatedResult<DocumentoListItem>>> {
  try {
    // Escala 100k+: lista SEMPRE paginada nas tabelas (inclui filtro por status).
    // Proibido carregar o bundle/snapshot completo so para filtrar — rebenta a 90k+.
    if (hasSupabaseConfig()) {
      const page = await listDocumentosPlanejamentoPageFromCloud({
        busca: filtro.busca,
        status: filtro.status,
        offset: (filtro.page - 1) * filtro.pageSize,
        limit: filtro.pageSize,
        page: filtro.page,
        signal: opcoes?.signal,
      });

      // Nao chamar sync_from_snapshot aqui — em 1k+ desenhos causa timeout e lista vazia.

      if (!page.error && page.source === 'tables') {
        const items: DocumentoListItem[] = page.documentos.map((d) => {
          const id = String(d.id ?? '');
          const quantidadePlanejada = Number(d.quantidadePlanejada) || 0;
          const quantidadeAtendida = Number(d.quantidadeAtendida) || 0;
          return {
            id,
            numero: String(d.numero ?? ''),
            revisao: String(d.revisao ?? 'A'),
            descricao: String(d.descricao ?? ''),
            responsavel: String(d.responsavel ?? ''),
            dataDocumento: String(d.data ?? '').slice(0, 10),
            status: statusDocumentoListaComQuantidades(d.status, quantidadePlanejada, quantidadeAtendida),
            totalItens: Number(d.totalItens) || 0,
            quantidadePlanejada,
            quantidadeAtendida,
          };
        });

        return {
          success: true,
          data: {
            items,
            total: page.total,
            page: filtro.page,
            pageSize: filtro.pageSize,
          },
          meta: {
            source: 'supabase',
            ...(page.total === 0 && items.length === 0
              ? { fallbackReason: 'Nenhum desenho nas tabelas de escala para este filtro.' }
              : {}),
          },
        };
      }

      // Timeout/falha: erro (nao success vazio) — UI mantém página anterior via keepPreviousData.
      // Nunca devolver success+items=[] (zerava a grelha com «Fallback… tempo esgotado»).
      if (page.error === 'AbortError') {
        const abortErr = new Error('AbortError');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return {
        success: false,
        error: traduzirErroOperacionalIsoPro(
          page.error || 'Nao foi possivel listar desenhos na nuvem. Tente de novo.',
        ),
      };
    }

    // Offline / sem Supabase: copia local apenas.
    const { enriched: comStatusPlanejamento } = await obterBundlePlanejamentoDocumentos();
    const meta: NonNullable<ServiceResult<Documento[]>['meta']> = {
      source: shouldTryRemoteRead() ? 'supabase' : 'local',
    };
    const items = aplicarFiltrosListaDocumentos(comStatusPlanejamento, filtro);

    const start = (filtro.page - 1) * filtro.pageSize;
    const end = start + filtro.pageSize;

    return {
      success: true,
      data: {
        items: items.slice(start, end).map(toListItem),
        total: items.length,
        page: filtro.page,
        pageSize: filtro.pageSize,
      },
      meta,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(getErrorMessage(error, MSG_ERRO_LEITURA_NUVEM)),
    };
  }
}

/** IDs de todos os documentos que correspondem ao filtro (ignora paginacao). */
export async function obterIdsDocumentosFiltrados(filtro: DocumentoFiltro): Promise<ServiceResult<string[]>> {
  try {
    if (hasSupabaseConfig()) {
      // RPC de IDs nas tabelas — nunca bundle completo (100k-safe).
      const cloud = await listDocumentosPlanejamentoIdsFromCloud({
        busca: filtro.busca,
        status: filtro.status,
      });
      if (!cloud.error && cloud.source === 'tables') {
        return { success: true, data: cloud.ids, meta: { source: 'supabase' } };
      }
      return {
        success: true,
        data: [],
        meta: {
          source: 'supabase',
          fallbackReason: cloud.error || 'Nao foi possivel listar IDs na nuvem.',
        },
      };
    }
    const { enriched: comStatus } = await obterBundlePlanejamentoDocumentos();
    const filtered = aplicarFiltrosListaDocumentos(comStatus, filtro);
    return { success: true, data: filtered.map((d) => d.id) };
  } catch (error) {
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(getErrorMessage(error, MSG_ERRO_LEITURA_NUVEM)),
    };
  }
}

/** Numero/revisao para confirmacao na UI (mesma fonte que a listagem). */
export async function obterResumosDocumentosParaExclusao(
  ids: string[],
): Promise<ServiceResult<{ numero: string; revisao: string }[]>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { success: true, data: [] };
  try {
    // 100k-safe: so os IDs pedidos via RPC SoT — nao carregar o catálogo inteiro.
    if (hasSupabaseConfig()) {
      const rows = await Promise.all(
        unique.map(async (id) => {
          const cloud = await readDocumentoPlanejamentoFromCloud({ id, numero: null, revisao: null });
          if (!cloud.documento) return null;
          return {
            numero: String(cloud.documento.numero ?? ''),
            revisao: String(cloud.documento.revisao ?? 'A'),
          };
        }),
      );
      const res = rows
        .filter((r): r is { numero: string; revisao: string } => Boolean(r?.numero))
        .sort((a, b) => a.numero.localeCompare(b.numero) || a.revisao.localeCompare(b.revisao));
      return { success: true, data: res, meta: { source: 'supabase' } };
    }
    const { enriched } = await obterBundlePlanejamentoDocumentos();
    const idSet = new Set(unique);
    const res = enriched
      .filter((d) => idSet.has(d.id))
      .map((d) => ({ numero: d.numero, revisao: d.revisao }))
      .sort((a, b) => a.numero.localeCompare(b.numero) || a.revisao.localeCompare(b.revisao));
    return { success: true, data: res };
  } catch (error) {
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(getErrorMessage(error, MSG_ERRO_LEITURA_NUVEM)),
    };
  }
}

export async function salvarDocumento(
  payload: DocumentoFormData,
  currentId?: string,
  opcoes?: { cancelarRevisoesAntigasActivas?: boolean; actorLogin?: string },
): Promise<ServiceResult<Documento>> {
  const validationError = validateDocumento(payload);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const matErr = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
    payload.itens.map((it) => it.codigoMaterial),
    'salvar',
    'documento',
  );
  if (matErr) {
    return { success: false, error: matErr };
  }

  const normalized = {
    ...payload,
    numero: payload.numero.trim(),
    revisao: payload.revisao.trim(),
    descricao: payload.descricao.trim(),
    responsavel: payload.responsavel.trim(),
    observacao: payload.observacao.trim(),
  };

  const recebimentos = await carregarRecebimentosCompletos();

  if (hasSupabaseConfig()) {
    try {
      let items = await loadDocumentos();
      const duplicated = items.find(
        (item) =>
          item.numero.toLowerCase() === normalized.numero.toLowerCase() &&
          item.revisao.toLowerCase() === normalized.revisao.toLowerCase() &&
          item.id !== currentId,
      );

      if (duplicated) {
        return { success: false, error: 'Ja existe um documento com esse numero e revisao.' };
      }

      const comStatus = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);

      if (currentId) {
        const index = items.findIndex((item) => item.id === currentId);
        if (index === -1) return { success: false, error: 'Documento nao encontrado.' };
        if (comStatus[index].status === 'cancelado') {
          return { success: false, error: 'Documentos cancelados nao podem ser editados.' };
        }
        const before = { ...comStatus[index], itens: [...(comStatus[index].itens ?? [])] };
        const mergeItens = preservarAtendimentoNosItens(comStatus[index].itens, normalized.itens);
        if (!mergeItens.ok) {
          return { success: false, error: mergeItens.error };
        }
        items[index] = {
          ...normalized,
          id: currentId,
          status: comStatus[index].status,
          itens: mergeItens.itens,
        };
        if (opcoes?.cancelarRevisoesAntigasActivas) {
          cancelarRevisoesActivasOutrasEmLista(items, normalized.numero, normalized.revisao, currentId, opcoes.actorLogin);
        }
        items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
        const bloqueioLocal = bloqueioSubstituicaoLocalDocumentos(items.length);
        if (bloqueioLocal) {
          return { success: false, error: bloqueioLocal };
        }
        const successData = items[index];
        const writeResult = await executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotDocumentos(items),
          writeLocal: () => writeAll(items),
          successData,
          fallbackMessage: 'Falha ao salvar documento no Supabase.',
        });
        if (writeResult.success && writeResult.data) {
          auditarDocumentoSalvo(before, writeResult.data);
        }
        return writeResult;
      }

      const newId = crypto.randomUUID();
      items.push({ ...normalized, id: newId, status: 'pendente' });
      if (opcoes?.cancelarRevisoesAntigasActivas) {
        cancelarRevisoesActivasOutrasEmLista(items, normalized.numero, normalized.revisao, newId, opcoes.actorLogin);
      }
      items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
      const bloqueioLocalNovo = bloqueioSubstituicaoLocalDocumentos(items.length);
      if (bloqueioLocalNovo) {
        return { success: false, error: bloqueioLocalNovo };
      }
      const successData = items.find((d) => d.id === newId)!;
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotDocumentos(items),
        writeLocal: () => writeAll(items),
        successData,
        fallbackMessage: 'Falha ao salvar documento no Supabase.',
      });
      if (writeResult.success && writeResult.data) {
        auditarDocumentoSalvo(undefined, writeResult.data);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar documento no Supabase.' };
    }
  }

  let items = await loadDocumentos();
  const duplicated = items.find(
    (item) =>
      item.numero.toLowerCase() === normalized.numero.toLowerCase() &&
      item.revisao.toLowerCase() === normalized.revisao.toLowerCase() &&
      item.id !== currentId,
  );

  if (duplicated) {
    return { success: false, error: 'Ja existe um documento com esse numero e revisao.' };
  }

  const comStatus = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Documento nao encontrado.' };
    if (comStatus[index].status === 'cancelado') {
      return { success: false, error: 'Documentos cancelados nao podem ser editados.' };
    }
    const before = { ...comStatus[index], itens: [...(comStatus[index].itens ?? [])] };
    const mergeItensLocal = preservarAtendimentoNosItens(comStatus[index].itens, normalized.itens);
    if (!mergeItensLocal.ok) {
      return { success: false, error: mergeItensLocal.error };
    }

    items[index] = {
      ...normalized,
      id: currentId,
      status: comStatus[index].status,
      itens: mergeItensLocal.itens,
    };
    if (opcoes?.cancelarRevisoesAntigasActivas) {
      cancelarRevisoesActivasOutrasEmLista(items, normalized.numero, normalized.revisao, currentId, opcoes.actorLogin);
    }
    items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
    const blockedDocEdit = whenBusinessWriteBlockedResult<Documento>();
    if (blockedDocEdit) return blockedDocEdit;
    writeAll(items);
    auditarDocumentoSalvo(before, items[index]);
    return { success: true, data: items[index] };
  }

  const newId = crypto.randomUUID();
  items.push({ ...normalized, id: newId, status: 'pendente' });
  if (opcoes?.cancelarRevisoesAntigasActivas) {
    cancelarRevisoesActivasOutrasEmLista(items, normalized.numero, normalized.revisao, newId, opcoes.actorLogin);
  }
  items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
  const blockedDocNovo = whenBusinessWriteBlockedResult<Documento>();
  if (blockedDocNovo) return blockedDocNovo;
  writeAll(items);
  const created = items.find((d) => d.id === newId)!;
  auditarDocumentoSalvo(undefined, created);
  return { success: true, data: created };
}

export async function cancelarDocumento(
  id: string,
  opcoes?: CancelarDocumentoOpcoes,
): Promise<ServiceResult<Documento>> {
  const recebimentos = await carregarRecebimentosCompletos();

  if (hasSupabaseConfig()) {
    try {
      const items = await loadDocumentos();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return { success: false, error: 'Documento nao encontrado.' };
      const comStatus = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
      const statusAnterior = comStatus[index].status;
      const validationError = validarCancelamentoDocumento(statusAnterior, opcoes);
      if (validationError) return { success: false, error: validationError };

      const docRef = items[index];
      items[index] = { ...docRef, status: 'cancelado' };
      const bloqueioLocalCancel = bloqueioSubstituicaoLocalDocumentos(items.length);
      if (bloqueioLocalCancel) {
        return { success: false, error: bloqueioLocalCancel };
      }
      const auditado = items[index];
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotDocumentos(items),
        writeLocal: () => writeAll(items),
        successData: auditado,
        fallbackMessage: 'Falha ao cancelar documento no Supabase.',
      });
      if (writeResult.success && writeResult.data) {
        auditarCancelamentoDocumento(writeResult.data, statusAnterior, opcoes);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao cancelar documento no Supabase.' };
    }
  }

  const items = await loadDocumentos();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Documento nao encontrado.' };
  const comStatus = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
  const statusAnterior = comStatus[index].status;
  const validationError = validarCancelamentoDocumento(statusAnterior, opcoes);
  if (validationError) return { success: false, error: validationError };

  const docRef = items[index];
  items[index] = { ...docRef, status: 'cancelado' };
  const blockedCancel = whenBusinessWriteBlockedResult<Documento>();
  if (blockedCancel) return blockedCancel;
  writeAll(items);
  const saved = items[index];
  auditarCancelamentoDocumento(saved, statusAnterior, opcoes);
  return { success: true, data: saved };
}

/**
 * Remove documentos do planejamento numa unica gravacao (snapshot / armazenamento local). Irreversivel; nao estorna recebimentos.
 * Se existir historico de atendimento (modulo Atendimento) ligado ao documento, a exclusao e recusada.
 * Confirmacao de senha e permissao administrar ficam na UI.
 */
export async function excluirDocumentosDefinitivamente(
  ids: string[],
  opcoes?: ExcluirDocumentoDefinitivamenteOpcoes,
): Promise<ServiceResult<{ removidos: number }>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) {
    return { success: false, error: 'Nenhum documento selecionado.' };
  }
  const idSet = new Set(unique);

  if (hasSupabaseConfig()) {
    try {
      const items = await loadDocumentos();
      const removidos = items.filter((item) => idSet.has(item.id));
      if (!removidos.length) {
        return { success: false, error: 'Nenhum documento encontrado para excluir.' };
      }
      const bloqueados = await listarDocumentosComAtendimentoVinculado(
        removidos.map((d) => ({ id: d.id, numero: d.numero, revisao: d.revisao })),
      );
      if (bloqueados.length) {
        return { success: false, error: formatarErroExclusaoBloqueadaPorAtendimento(bloqueados) };
      }
      const next = items.filter((item) => !idSet.has(item.id));

      const bloqueioLocalExcluir = bloqueioSubstituicaoLocalDocumentos(items.length);
      if (bloqueioLocalExcluir) {
        return { success: false, error: bloqueioLocalExcluir };
      }

      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () =>
          writeSnapshotDocumentos(next, {
            dispensarValidacaoRefsAtendimento: true,
            remocoesEsperadas: removidos.length,
          }),
        writeLocal: () => writeAll(next),
        successData: { removidos: removidos.length },
        fallbackMessage: 'Falha ao excluir documentos no Supabase.',
      });
      if (writeResult.success) {
        invalidateIsoProSnapshotCache();
        auditarExclusaoDefinitivaDocumentosVarios(removidos, opcoes);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao excluir documentos no Supabase.' };
    }
  }

  const items = await loadDocumentos();
  const removidos = items.filter((item) => idSet.has(item.id));
  if (!removidos.length) {
    return { success: false, error: 'Nenhum documento encontrado para excluir.' };
  }
  const bloqueados = await listarDocumentosComAtendimentoVinculado(
    removidos.map((d) => ({ id: d.id, numero: d.numero, revisao: d.revisao })),
  );
  if (bloqueados.length) {
    return { success: false, error: formatarErroExclusaoBloqueadaPorAtendimento(bloqueados) };
  }
  const next = items.filter((item) => !idSet.has(item.id));
  const blockedExcluir = whenBusinessWriteBlockedResult<{ removidos: number }>();
  if (blockedExcluir) return blockedExcluir;
  writeAll(next);
  invalidateIsoProSnapshotCache();
  auditarExclusaoDefinitivaDocumentosVarios(removidos, opcoes);
  return {
    success: true,
    data: { removidos: removidos.length },
    meta: { source: 'local' as const },
  };
}

export async function excluirDocumentoDefinitivamente(
  id: string,
  opcoes?: ExcluirDocumentoDefinitivamenteOpcoes,
): Promise<ServiceResult<{ removido: true }>> {
  const r = await excluirDocumentosDefinitivamente([id], opcoes);
  if (!r.success || !r.data) {
    return { success: false, error: r.error, meta: r.meta };
  }
  return { success: true, data: { removido: true }, meta: r.meta };
}

function normalizarNumeroDocumentoBusca(numero: string): string {
  return numero
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Mesmo desenho com espacos / caixa diferentes (ex.: copia do mobile vs cadastro). */
function numerosDocumentoEquivalentes(numeroCadastro: string, numeroBusca: string): boolean {
  const a = normalizarNumeroDocumentoBusca(numeroCadastro);
  const b = normalizarNumeroDocumentoBusca(numeroBusca);
  if (a === b) return true;
  if (a.replace(/\s/g, '').toLowerCase() === b.replace(/\s/g, '').toLowerCase()) return true;
  return false;
}

function localizarDocumentoNaLista(
  lista: Documento[],
  id: string,
  numeroFallback?: string | null,
): Documento | undefined {
  const idNorm = String(id ?? '').trim();
  if (idNorm && idNorm !== 'null' && idNorm !== 'undefined') {
    const byId = lista.find((documento) => String(documento.id).trim() === idNorm);
    if (byId) return byId;
  }
  const n = normalizarNumeroDocumentoBusca(String(numeroFallback ?? ''));
  if (n && n !== '-' && n.toUpperCase() !== 'MULTIPLOS') {
    return lista.find((d) => numerosDocumentoEquivalentes(d.numero, n));
  }
  return undefined;
}

/** Converte wire da RPC/tabelas para o modelo de UI do planejamento. */
function documentoFromPlanejamentoWire(
  wire: {
    id?: string | number;
    numero?: string;
    revisao?: string;
    data?: string;
    descricao?: string;
    responsavel?: string;
    status?: string;
    observacao?: string;
    itens?: Array<{
      id?: string | number;
      codigo?: string;
      descricao?: string;
      unidade?: string;
      quantidade?: number;
      quantidadeAtendida?: number;
      localizacao?: string;
    }>;
  },
  idFallback?: string,
): Documento {
  const itensRaw = Array.isArray(wire.itens) ? wire.itens : [];
  const form: DocumentoFormData = {
    numero: String(wire.numero ?? ''),
    revisao: String(wire.revisao ?? 'A'),
    descricao: String(wire.descricao ?? ''),
    responsavel: String(wire.responsavel ?? ''),
    dataDocumento: String(wire.data ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    observacao: String(wire.observacao ?? ''),
    itens: itensRaw.map((it, index) => ({
      id: String(it.id ?? `item-${index + 1}`),
      codigoMaterial: String(it.codigo ?? ''),
      descricaoMaterial: String(it.descricao ?? ''),
      unidade: String(it.unidade ?? 'UN') || 'UN',
      quantidadeProjeto: Number(it.quantidade) || 0,
      quantidadeAtendida: Number(it.quantidadeAtendida) || 0,
      localizacao: String(it.localizacao ?? '').trim(),
    })),
  };
  return {
    id: String(wire.id ?? idFallback ?? ''),
    ...form,
    status: statusDocumentoListaSeguro(wire.status) || deriveStatusSnapshot(form),
  };
}

async function buscarDocumentoNasTabelasSoT(
  id: string,
  numeroFallback?: string | null,
): Promise<Documento | null> {
  if (!hasSupabaseConfig()) return null;
  const idNorm = String(id ?? '').trim();
  const num = String(numeroFallback ?? '').trim();
  const cloud = await readDocumentoPlanejamentoFromCloud({
    id: idNorm || null,
    numero: idNorm ? null : num || null,
    revisao: null,
  });
  if (!cloud.documento) return null;
  return documentoFromPlanejamentoWire(cloud.documento, idNorm || undefined);
}

/**
 * Detalhe / folha / modal: quantidadeAtendida por linha vem das tabelas SoT (mesma fonte da lista paginada).
 * O snapshot JSON pode ficar stale apos baixa mobile (baixa rapida so espelha tabelas).
 */
async function buscarDocumentoPreferindoTabelasSoT(
  id: string,
  numeroFallback: string | null | undefined,
  recebimentos: Awaited<ReturnType<typeof carregarRecebimentosCompletos>> = [],
): Promise<Documento | null> {
  const fromTables = await buscarDocumentoNasTabelasSoT(id, numeroFallback);
  if (!fromTables) return null;
  // Sem as NFs, o recálculo zerava o estoque e gravava Pendente no objeto
  // enquanto as linhas (métricas) continuavam Recebido.
  if (recebimentos.length === 0) return fromTables;
  const [enriched] = aplicarStatusPlanejamentoEmDocumentos([fromTables], recebimentos);
  return enriched ?? fromTables;
}

export function documentoComStatusDasLinhas(
  doc: Documento,
  metricas: Map<string, MetricasPorCodigoMaterial>,
): Documento {
  if (doc.status === 'cancelado' || metricas.size === 0) return doc;
  const status = resolverStatusDocumentoPlanejamento(doc, metricas);
  return status === doc.status ? doc : { ...doc, status };
}

/**
 * Ordem: tabelas SoT (qAt por linha) → snapshot reconciliado → snapshot bruto.
 * A lista paginada ja usa tabelas; o snapshot sozinho deixava QTD ATENDIDA=0 no detalhe apos baixa mobile.
 */
export async function buscarDocumentoPorIdOuNumero(
  id: string,
  numeroFallback?: string | null,
): Promise<ServiceResult<Documento>> {
  const fromTables = await buscarDocumentoPreferindoTabelasSoT(id, numeroFallback, []);
  if (fromTables) return { success: true, data: fromTables };

  // Online: nao baixar catalogo + recebimentos so para 1 documento.
  if (hasSupabaseConfig()) {
    const snapshotDocs = await readSnapshotDocumentos();
    const foundRaw = localizarDocumentoNaLista(snapshotDocs, id, numeroFallback);
    if (foundRaw) {
      const [enriched] = aplicarStatusPlanejamentoEmDocumentos([foundRaw], []);
      return { success: true, data: enriched ?? foundRaw };
    }
    return { success: false, error: 'Documento nao encontrado.' };
  }

  const { enriched, recebimentos } = await obterBundlePlanejamentoDocumentos();
  const foundClean = localizarDocumentoNaLista(enriched, id, numeroFallback);
  if (foundClean) return { success: true, data: foundClean };

  const snapshotDocs = await readSnapshotDocumentos();
  const brutos = aplicarStatusPlanejamentoEmDocumentos(snapshotDocs, recebimentos);
  const foundOffline = localizarDocumentoNaLista(brutos, id, numeroFallback);
  if (foundOffline) return { success: true, data: foundOffline };

  return { success: false, error: 'Documento nao encontrado.' };
}

export async function buscarDocumentoPorId(id: string): Promise<ServiceResult<Documento>> {
  return buscarDocumentoPorIdOuNumero(id, null);
}

export async function carregarTodosDocumentosOrdenados(): Promise<ServiceResult<Documento[]>> {
  try {
    // Exportacao / catalogo completo: ler tabelas SoT directo (sem corrida localStorage
    // de 15s). A lista da UI ja e paginada nas tabelas; o Excel tem de usar a mesma fonte.
    let data: Documento[];
    let meta: NonNullable<ServiceResult<Documento[]>['meta']>;
    if (hasSupabaseConfig()) {
      const fromTables = await listAllDocumentosPlanejamentoCompletosFromCloud();
      if (!fromTables.error && fromTables.documentos.length > 0) {
        data = fromTables.documentos.map((wire) => documentoFromPlanejamentoWire(wire));
        meta = { source: 'supabase' };
      } else {
        const base = await carregarDocumentosBase();
        data = base.data;
        meta = base.meta;
        if (fromTables.error) {
          meta = { ...meta, fallbackReason: fromTables.error };
        }
      }
    } else {
      const base = await carregarDocumentosBase();
      data = base.data;
      meta = base.meta;
    }
    const recebimentos = await carregarRecebimentosCompletos();
    const enriched = aplicarStatusPlanejamentoEmDocumentos(data, recebimentos);
    const items = [...enriched].sort(
      (a, b) => b.dataDocumento.localeCompare(a.dataDocumento) || a.numero.localeCompare(b.numero),
    );
    return { success: true, data: items, meta };
  } catch (error) {
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(getErrorMessage(error, MSG_ERRO_LEITURA_NUVEM)),
    };
  }
}

/**
 * Catalogo para Excel/CSV: tabelas SoT sem carregar NFs completas (isso era o gargalo de minutos).
 * Status do documento vem da coluna SoT; metricas/localizacoes vêm de RPC no montarExportacao.
 */
async function carregarDocumentosParaExportacaoCsv(): Promise<ServiceResult<Documento[]>> {
  try {
    let data: Documento[];
    let meta: NonNullable<ServiceResult<Documento[]>['meta']>;
    if (hasSupabaseConfig()) {
      const fromTables = await listAllDocumentosPlanejamentoCompletosFromCloud();
      if (!fromTables.error && fromTables.documentos.length > 0) {
        data = fromTables.documentos.map((wire) => documentoFromPlanejamentoWire(wire));
        meta = { source: 'supabase' };
      } else {
        const base = await carregarDocumentosBase();
        data = base.data;
        meta = base.meta;
        if (fromTables.error) {
          meta = { ...meta, fallbackReason: fromTables.error };
        }
      }
    } else {
      const base = await carregarDocumentosBase();
      data = base.data;
      meta = base.meta;
    }
    const items = [...data].sort(
      (a, b) => b.dataDocumento.localeCompare(a.dataDocumento) || a.numero.localeCompare(b.numero),
    );
    return { success: true, data: items, meta };
  } catch (error) {
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(getErrorMessage(error, MSG_ERRO_LEITURA_NUVEM)),
    };
  }
}

async function carregarMetricasPlanejamentoAgregadas(
  codigos?: string[],
): Promise<Map<string, MetricasPorCodigoMaterial>> {
  const fromRpc = await fetchMetricasPlanejamentoPorCodigo(codigos).catch(() => null);
  if (fromRpc) return fromRpc;
  // 100k-safe: NUNCA fallback para bundle completo (catalogo + NFs).
  // Sem RPC: mapa vazio → linhas mostram Pendente ate a RPC voltar.
  return new Map();
}

/** Metragens globais por codigo (documentos + recebimentos) para colunas de status no editor e na visualizacao. */
export async function carregarMetricasPlanejamentoPorCodigo(): Promise<Map<string, MetricasPorCodigoMaterial>> {
  return carregarMetricasPlanejamentoAgregadas();
}

/** Metricas de status + mapa de localizacoes agregadas por codigo (recebimentos), numa unica leitura. */
export async function carregarMetricasELocalizacoesPlanejamentoPorCodigo(): Promise<{
  metricas: Map<string, MetricasPorCodigoMaterial>;
  localizacoesRecebimentoPorCodigo: Map<string, string>;
}> {
  const [metricas, locs] = await Promise.all([
    carregarMetricasPlanejamentoAgregadas(),
    fetchLocalizacoesRecebimentoPorCodigo().catch(() => null),
  ]);
  return {
    metricas,
    localizacoesRecebimentoPorCodigo: locs ?? new Map(),
  };
}

/**
 * Aquece cache partilhado (documentos + recebimentos + metricas).
 * Não chamar no mount da lista — com 4k+ desenhos bloqueava o ecrã.
 * Usar sob demanda (ex.: primeiro «Visualizar»).
 */
export async function precarregarBundlePlanejamentoDocumentos(): Promise<void> {
  // 100k-safe: aquece so agregados, nao o catalogo.
  await Promise.all([
    carregarMetricasPlanejamentoAgregadas().catch(() => undefined),
    fetchLocalizacoesRecebimentoPorCodigo().catch(() => undefined),
  ]);
}

export type DocumentoPlanejamentoVisualizacao = {
  documento: Documento;
  metricas: Map<string, MetricasPorCodigoMaterial>;
  localizacoesRecebimentoPorCodigo: Map<string, string>;
  /** Quando as RPCs de estoque falham (ex.: sessao Auth), o status das linhas fica so com baixa. */
  metricasAviso?: string;
  /** EXE: documento ja esta pronto; metricas vao a carregar em segundo plano. */
  metricasPending?: boolean;
};

type MetricasPorCodigoRpc = Record<
  string,
  { prevista?: unknown; recebido?: unknown; atendido?: unknown }
>;

function mapMetricasPorCodigo(
  porCodigo: MetricasPorCodigoRpc | null | undefined,
): Map<string, MetricasPorCodigoMaterial> {
  const metricas = new Map<string, MetricasPorCodigoMaterial>();
  if (!porCodigo) return metricas;
  for (const [k, v] of Object.entries(porCodigo)) {
    const key = k.trim().toLowerCase();
    if (!key || !v || typeof v !== 'object') continue;
    metricas.set(key, {
      prevista: Number(v.prevista) || 0,
      recebido: Number(v.recebido) || 0,
      atendido: Number(v.atendido) || 0,
    });
  }
  return metricas;
}

function mapLocalizacoesPorCodigo(
  porLoc: Record<string, unknown> | null | undefined,
): Map<string, string> {
  const locs = new Map<string, string>();
  if (!porLoc) return locs;
  for (const [k, v] of Object.entries(porLoc)) {
    const key = k.trim().toLowerCase();
    const texto = String(v ?? '').trim();
    if (key && texto) locs.set(key, texto);
  }
  return locs;
}

/** So metricas (status) — fatia cache; nao espera localizacoes. */
export async function carregarSoMetricasPlanejamentoVisualizacao(
  codes: string[],
  opts?: { onPartial?: (metricas: Map<string, MetricasPorCodigoMaterial>) => void },
): Promise<{
  metricas: Map<string, MetricasPorCodigoMaterial>;
  metricasAviso?: string;
}> {
  const tenantId = getActiveTenantId();
  const fetched = await fetchMetricasPlanejamentoPorCodigos(tenantId, codes, {
    onPartial: opts?.onPartial
      ? (por) => opts.onPartial!(mapMetricasPorCodigo(por))
      : undefined,
  });
  return {
    metricas: mapMetricasPorCodigo(fetched.porCodigo),
    ...(fetched.aviso ? { metricasAviso: fetched.aviso } : {}),
  };
}

/** Estado em memoria do ultimo mapa de metricas (todas as empresas / Visualizar instantaneo). */
export function peekMetricasPlanejamentoMemoria(codes: string[]): Map<string, MetricasPorCodigoMaterial> {
  return mapMetricasPorCodigo(sliceMetricasMemoria(getActiveTenantId(), codes));
}

export async function carregarLocalizacoesPlanejamentoVisualizacao(
  codes: string[],
): Promise<Map<string, string>> {
  const tenantId = getActiveTenantId();
  const porLoc = await fetchLocalizacoesPlanejamentoPorCodigos(tenantId, codes);
  return mapLocalizacoesPorCodigo(porLoc);
}

/** Estoque + localizacoes para o modal Visualizar / PDF (JWT sem fila de sessao). */
export async function carregarMetricasPlanejamentoVisualizacao(codes: string[]): Promise<{
  metricas: Map<string, MetricasPorCodigoMaterial>;
  localizacoesRecebimentoPorCodigo: Map<string, string>;
  metricasAviso?: string;
}> {
  const [met, locs] = await Promise.all([
    carregarSoMetricasPlanejamentoVisualizacao(codes),
    carregarLocalizacoesPlanejamentoVisualizacao(codes),
  ]);
  return {
    metricas: met.metricas,
    localizacoesRecebimentoPorCodigo: locs,
    ...(met.metricasAviso ? { metricasAviso: met.metricasAviso } : {}),
  };
}

const METRICAS_CODE_CHUNK = 120;
/** Cache REST + RPC curtos — UI ja tem semente das linhas; nao bloquear 12s. */
const METRICAS_LIVE_TIMEOUT_MS = 5_000;
const METRICAS_CACHE_REST_TIMEOUT_MS = 3_500;
const METRICAS_RPC_TIMEOUT_MS = METRICAS_LIVE_TIMEOUT_MS;
const METRICAS_MEM_TTL_MS = 180_000;
const LOCS_MEM_TTL_MS = 180_000;
const LOCS_REST_TIMEOUT_MS = 4_000;

type MetricasMemEntry = { tenantId: string; at: number; porCodigo: MetricasPorCodigoRpc };
let metricasMemoria: MetricasMemEntry | null = null;

type LocsMemEntry = { tenantId: string; at: number; porCodigo: Record<string, string> };
let locsMemoria: LocsMemEntry | null = null;

function rememberMetricasMemoria(tenantId: string, porCodigo: MetricasPorCodigoRpc): void {
  const prev =
    metricasMemoria?.tenantId === tenantId ? metricasMemoria.porCodigo : ({} as MetricasPorCodigoRpc);
  metricasMemoria = {
    tenantId,
    at: Date.now(),
    porCodigo: { ...prev, ...porCodigo },
  };
}

function sliceMetricasMemoria(tenantId: string, codes: string[]): MetricasPorCodigoRpc | null {
  if (!metricasMemoria || metricasMemoria.tenantId !== tenantId) return null;
  if (Date.now() - metricasMemoria.at > METRICAS_MEM_TTL_MS) return null;
  const wanted = new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return {};
  const out: MetricasPorCodigoRpc = {};
  let hit = 0;
  for (const [k, v] of Object.entries(metricasMemoria.porCodigo)) {
    const key = k.trim().toLowerCase();
    if (!wanted.has(key) || !v || typeof v !== 'object') continue;
    out[key] = v;
    hit += 1;
  }
  return hit > 0 ? out : null;
}

function rememberLocsMemoria(tenantId: string, porCodigo: Record<string, string>): void {
  const prev = locsMemoria?.tenantId === tenantId ? locsMemoria.porCodigo : {};
  locsMemoria = { tenantId, at: Date.now(), porCodigo: { ...prev, ...porCodigo } };
}

function sliceLocsMemoria(tenantId: string, codes: string[]): Record<string, string> | null {
  if (!locsMemoria || locsMemoria.tenantId !== tenantId) return null;
  if (Date.now() - locsMemoria.at > LOCS_MEM_TTL_MS) return null;
  const wanted = new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return {};
  const out: Record<string, string> = {};
  let hit = 0;
  for (const [k, v] of Object.entries(locsMemoria.porCodigo)) {
    const key = k.trim().toLowerCase();
    const texto = String(v ?? '').trim();
    if (!wanted.has(key) || !texto) continue;
    out[key] = texto;
    hit += 1;
  }
  return hit > 0 ? out : null;
}

/** Fatia o cache gravado (SELECT directo) — evita o scan lento das tabelas filtradas. */
async function tryMetricasCacheSliceRest(
  tenantId: string,
  codes: string[],
): Promise<MetricasPorCodigoRpc | null> {
  const { data, error } = await restGetSemFilaAuth<Array<{ por_codigo?: MetricasPorCodigoRpc | null }>>(
    `iso_pro_metricas_planejamento_cache?tenant_id=eq.${encodeURIComponent(tenantId)}&select=por_codigo`,
    METRICAS_CACHE_REST_TIMEOUT_MS,
  );
  if (error || !data?.[0]?.por_codigo || typeof data[0].por_codigo !== 'object') return null;
  const por = data[0].por_codigo;
  const wanted = new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const out: MetricasPorCodigoRpc = {};
  let hit = 0;
  for (const [k, v] of Object.entries(por)) {
    const key = k.trim().toLowerCase();
    if (!wanted.has(key) || !v || typeof v !== 'object') continue;
    out[key] = v;
    hit += 1;
  }
  return hit > 0 ? out : null;
}

/** Localizacoes por codigo via REST (filtro in.) — nao depende da RPC pesada. */
async function tryLocalizacoesRestPorCodigos(
  tenantId: string,
  codes: string[],
): Promise<Record<string, string> | null> {
  const unique = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!unique.length) return {};
  const merged: Record<string, Set<string>> = {};
  let anyOk = false;
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const inList = chunk
      .map((c) => `"${c.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      .join(',');
    const { data, error } = await restGetSemFilaAuth<
      Array<{ codigo?: string | null; localizacao?: string | null }>
    >(
      `iso_pro_recebimento_itens?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&codigo=in.(${inList})&select=codigo,localizacao&localizacao=not.is.null&limit=5000`,
      LOCS_REST_TIMEOUT_MS,
    );
    if (error || !Array.isArray(data)) continue;
    anyOk = true;
    for (const row of data) {
      const key = normalizeCodigoPlanejamento(String(row.codigo ?? ''));
      const loc = String(row.localizacao ?? '').trim();
      if (!key || !loc) continue;
      if (!merged[key]) merged[key] = new Set();
      merged[key]!.add(loc);
    }
  }
  if (!anyOk) return null;
  const out: Record<string, string> = {};
  for (const [k, set] of Object.entries(merged)) {
    out[k] = [...set]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      .join(' | ');
  }
  return out;
}

/**
 * Evita a fila de sessao do supabase-js.
 * Nunca usar `supabase.rpc()` aqui: no Electron o Auth lock (getSession) pode
 * prender o abortSignal antes do HTTP — Visualizar ficava eternamente em «…»
 * e o botão PDF desactivado (pior após trocar de empresa).
 */
async function rpcMetricasAuthPreferida<T>(
  fn: string,
  args: Record<string, unknown>,
  timeoutMs = METRICAS_RPC_TIMEOUT_MS,
): Promise<{ data: T | null; error: string | null }> {
  const jwt = await rpcComJwtSemFila<T>(fn, args, timeoutMs);
  if (!jwt.skipped) return { data: jwt.data, error: jwt.error };
  return rpcSemFilaAuth<T>(fn, args, timeoutMs);
}

function mergePorCodigoMaps(
  into: MetricasPorCodigoRpc,
  chunk: MetricasPorCodigoRpc | null | undefined,
): void {
  if (!chunk || typeof chunk !== 'object') return;
  for (const [k, v] of Object.entries(chunk)) {
    if (k && v && typeof v === 'object') into[k] = v;
  }
}

function metricasAvisoDeErro(lastMetError: string | null): string {
  const errLow = (lastMetError ?? '').toLowerCase();
  if (
    errLow.includes('42501') ||
    errLow.includes('permission') ||
    errLow.includes('jwt') ||
    errLow.includes('401')
  ) {
    return 'Sessao Auth em falta para o estoque. Saia e entre de novo no I.S.O PRO.';
  }
  // Timeout / rede: mensagem curta — a UI ja mostra status pelas linhas do documento.
  return 'Estoque da nuvem indisponivel de momento. Status pelas quantidades do documento.';
}

/**
 * Se o mapa veio sem recebido (cache velho), aplica o mesmo agregado vivo do CSV.
 * So corre quando nenhum codigo do documento tem recebido>0 — evita baixar o mapa sempre.
 */
async function overlayRecebidoVivoSeTudoZero(
  tenantId: string,
  codes: string[],
  into: MetricasPorCodigoRpc,
): Promise<void> {
  const wanted = [...new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (!wanted.length) return;
  const algumRecebido = wanted.some((k) => Number(into[k]?.recebido) > 0);
  if (algumRecebido) return;

  const rpc = await rpcMetricasAuthPreferida<{
    porCodigo?: Record<string, unknown>;
    _error?: string;
  }>('iso_pro_sum_quantidade_recebida_por_codigo', { p_tenant_id: tenantId });
  if (rpc.error || rpc.data?._error || !rpc.data?.porCodigo || typeof rpc.data.porCodigo !== 'object') {
    return;
  }
  const wantedSet = new Set(wanted);
  for (const [k, v] of Object.entries(rpc.data.porCodigo)) {
    const key = k.trim().toLowerCase();
    if (!wantedSet.has(key)) continue;
    const recebido = Number(v) || 0;
    if (recebido <= 0) continue;
    const cur = into[key] ?? { prevista: 0, atendido: 0, recebido: 0 };
    into[key] = {
      prevista: Number(cur.prevista) || 0,
      atendido: Number(cur.atendido) || 0,
      recebido,
    };
  }
}

/**
 * Metricas para Visualizar (todas as empresas):
 * 1) Memória local
 * 2) Fatia do cache via REST (rapido; evita scan tabelas)
 * 3) RPC filtrada em paralelo (quando cache_slice estiver no servidor, e instantanea)
 * 4) onPartial assim que o 1.º dado chega
 */
async function fetchMetricasPlanejamentoPorCodigos(
  tenantId: string,
  codes: string[],
  opts?: { onPartial?: (porCodigo: MetricasPorCodigoRpc) => void },
): Promise<{ porCodigo: MetricasPorCodigoRpc | null; aviso?: string }> {
  const unique = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!unique.length) return { porCodigo: {} };

  const mergedMet: MetricasPorCodigoRpc = {};
  let metOk = false;
  let lastMetError: string | null = null;

  const emitPartial = () => {
    if (!opts?.onPartial || !metOk) return;
    opts.onPartial({ ...mergedMet });
  };

  const fromMem = sliceMetricasMemoria(tenantId, unique);
  if (fromMem) {
    mergePorCodigoMaps(mergedMet, fromMem);
    metOk = true;
    emitPartial();
  }

  // Cache REST em paralelo com RPC — o que chegar primeiro alimenta a UI.
  const cachePromise = tryMetricasCacheSliceRest(tenantId, unique).then((fromCache) => {
    if (!fromCache) return;
    mergePorCodigoMaps(mergedMet, fromCache);
    metOk = true;
    rememberMetricasMemoria(tenantId, fromCache);
    emitPartial();
  });

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += METRICAS_CODE_CHUNK) {
    chunks.push(unique.slice(i, i + METRICAS_CODE_CHUNK));
  }

  const rpcPromise = Promise.all(
    chunks.map(async (chunk) => {
      const met = await rpcMetricasAuthPreferida<{ porCodigo?: MetricasPorCodigoRpc; _error?: string }>(
        'iso_pro_sum_metricas_planejamento_por_codigo',
        { p_tenant_id: tenantId, p_codigos: chunk },
        METRICAS_LIVE_TIMEOUT_MS,
      );
      if (met.error || met.data?._error) {
        lastMetError = met.error || String(met.data?._error ?? '') || lastMetError;
        return;
      }
      if (met.data?.porCodigo && typeof met.data.porCodigo === 'object') {
        mergePorCodigoMaps(mergedMet, met.data.porCodigo);
        metOk = true;
        rememberMetricasMemoria(tenantId, met.data.porCodigo);
        emitPartial();
      }
    }),
  );

  await Promise.all([cachePromise, rpcPromise]);

  // Com semente/memoria/cache: nunca aviso vermelho agressivo.
  if (!metOk) return { porCodigo: null, aviso: metricasAvisoDeErro(lastMetError) };

  // Overlay recebido CSV — curto e só se ainda tudo a zero (não bloqueia partial).
  void Promise.race([
    overlayRecebidoVivoSeTudoZero(tenantId, unique, mergedMet).then(() => {
      rememberMetricasMemoria(tenantId, mergedMet);
    }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 2_000);
    }),
  ]);

  rememberMetricasMemoria(tenantId, mergedMet);
  return { porCodigo: mergedMet };
}

async function fetchLocalizacoesPlanejamentoPorCodigos(
  tenantId: string,
  codes: string[],
): Promise<Record<string, unknown> | null> {
  const unique = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!unique.length) return {};

  const fromMem = sliceLocsMemoria(tenantId, unique);
  if (fromMem && Object.keys(fromMem).length > 0) {
    // Actualiza em fundo; devolve memoria ja.
    void (async () => {
      const rest = await tryLocalizacoesRestPorCodigos(tenantId, unique);
      if (rest && Object.keys(rest).length) rememberLocsMemoria(tenantId, rest);
    })();
    return fromMem;
  }

  const fromRest = await tryLocalizacoesRestPorCodigos(tenantId, unique);
  if (fromRest && Object.keys(fromRest).length > 0) {
    rememberLocsMemoria(tenantId, fromRest);
    return fromRest;
  }

  // Fallback RPC (pode ser lento) — timeout curto; falha silenciosa.
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += METRICAS_CODE_CHUNK) {
    chunks.push(unique.slice(i, i + METRICAS_CODE_CHUNK));
  }
  const mergedLoc: Record<string, string> = {};
  const results = await Promise.all(
    chunks.map((chunk) =>
      rpcMetricasAuthPreferida<{ porCodigo?: Record<string, unknown>; _error?: string }>(
        'iso_pro_localizacoes_recebimento_por_codigo',
        { p_tenant_id: tenantId, p_codigos: chunk },
        METRICAS_LIVE_TIMEOUT_MS,
      ),
    ),
  );
  for (const loc of results) {
    if (!loc.error && !loc.data?._error && loc.data?.porCodigo && typeof loc.data.porCodigo === 'object') {
      for (const [k, v] of Object.entries(loc.data.porCodigo)) {
        const key = k.trim().toLowerCase();
        const texto = String(v ?? '').trim();
        if (key && texto) mergedLoc[key] = texto;
      }
    }
  }
  if (Object.keys(mergedLoc).length) rememberLocsMemoria(tenantId, mergedLoc);
  return mergedLoc;
}

/** Uma unica leitura do bundle para modal «Visualizar» (documento + metricas + localizacoes). */
export async function carregarDocumentoPlanejamentoParaVisualizacao(
  id: string,
  onDocumento?: (documento: Documento) => void,
  options?: { deferMetricas?: boolean },
): Promise<ServiceResult<DocumentoPlanejamentoVisualizacao>> {
  const tenantId = getActiveTenantId();
  const lido = await rpcComJwtSemFila<{
    documento?: Parameters<typeof documentoFromPlanejamentoWire>[0] | null;
    _error?: string;
  }>('iso_pro_read_documento_planejamento', {
    p_tenant_id: tenantId,
    p_documento_id: id,
    p_numero: null,
    p_revisao: null,
  }, 20_000);
  const lidoFinal =
    lido.skipped || lido.error || !lido.data?.documento
      ? await rpcSemFilaAuth<{
          documento?: Parameters<typeof documentoFromPlanejamentoWire>[0] | null;
          _error?: string;
        }>(
          'iso_pro_read_documento_planejamento',
          {
            p_tenant_id: tenantId,
            p_documento_id: id,
            p_numero: null,
            p_revisao: null,
          },
          20_000,
        )
      : { data: lido.data, error: lido.error };

  const wire = lidoFinal.data?.documento;
  if (wire && typeof wire === 'object') {
    const fromTables = documentoFromPlanejamentoWire(wire, id);
    onDocumento?.(fromTables);
    const codes = fromTables.itens.map((it) => it.codigoMaterial).filter(Boolean);

    if (options?.deferMetricas && codes.length) {
      return {
        success: true,
        data: {
          documento: fromTables,
          metricas: new Map(),
          localizacoesRecebimentoPorCodigo: new Map(),
          metricasPending: true,
        },
      };
    }

    let metricas = new Map<string, MetricasPorCodigoMaterial>();
    let locs = new Map<string, string>();
    let metricasAviso: string | undefined;
    if (codes.length) {
      const fetched = await carregarMetricasPlanejamentoVisualizacao(codes);
      metricas = fetched.metricas;
      locs = fetched.localizacoesRecebimentoPorCodigo;
      metricasAviso = fetched.metricasAviso;
    }
    return {
      success: true,
      data: {
        documento: documentoComStatusDasLinhas(fromTables, metricas),
        metricas,
        localizacoesRecebimentoPorCodigo: locs,
        ...(metricasAviso ? { metricasAviso } : {}),
      },
    };
  }

  if (!hasSupabaseConfig()) {
    const bundle = await obterBundlePlanejamentoDocumentos();
    const foundClean = localizarDocumentoNaLista(bundle.enriched, id, null);
    if (foundClean) {
      onDocumento?.(foundClean);
      return {
        success: true,
        data: {
          documento: foundClean,
          metricas: bundle.metricas,
          localizacoesRecebimentoPorCodigo: bundle.localizacoesRecebimentoPorCodigo,
        },
      };
    }
  }

  return { success: false, error: lidoFinal.error ?? 'Documento nao encontrado.' };
}

/**
 * Abre a folha de campo numa janela de pre-visualizacao dedicada (desktop) ou overlay (web).
 * A lista de planejamento permanece visivel na janela principal.
 */
export async function visualizarPlanejamentoCampoPorId(
  item: Pick<DocumentoListItem, 'id' | 'numero' | 'revisao'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const titulo = `Planejamento — ${item.numero || item.id || 'documento'}`;
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;
  void api?.beginHtmlPreviewLoading?.(titulo);

  const loaded = await buscarDocumentoPorIdOuNumero(item.id, item.numero);
  if (!loaded.success || !loaded.data) {
    return { ok: false, error: loaded.error ?? 'Documento nao encontrado.' };
  }
  const codes = loaded.data.itens.map((it) => it.codigoMaterial).filter(Boolean);
  // Mesmo caminho do Visualizar (JWT sem fila) — supabase.rpc no EXE deixava tudo Pendente.
  const metPack = await carregarMetricasPlanejamentoVisualizacao(codes);
  const metricas = metPack.metricas;
  const locs = metPack.localizacoesRecebimentoPorCodigo;
  const doc = documentoComStatusDasLinhas(loaded.data, metricas);

  const ok = await imprimirPlanejamentoCampoHtml(doc, metricas, locs ?? new Map());
  return ok ? { ok: true } : { ok: false, error: 'Nao foi possivel abrir a pre-visualizacao.' };
}

function extrairListaDocumentosDoImport(
  parsed: unknown,
): { ok: true; list: unknown[] } | { ok: false; error: string } {
  const list = parseDocumentosImportJsonRoot(parsed);
  if (list === null) {
    return {
      ok: false,
      error: 'Formato invalido: use um array de documentos ou um objeto com a propriedade "documentos".',
    };
  }
  return { ok: true, list };
}

function normalizarItemImportacao(raw: unknown, docIndex: number, itemIndex: number): DocumentoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const codigoMaterial = extrairCodigoMaterialDeObjetoImport(o);
  const descricaoMaterial = String(o.descricaoMaterial ?? o.descricao_item ?? o.descricao ?? '').trim();
  const unidadeRaw = String(o.unidade ?? 'UN').trim();
  const unidade = unidadeRaw || 'UN';
  const quantidadeProjeto = Number(o.quantidadeProjeto ?? o.quantidade ?? 0);
  const quantidadeAtendida = Number(o.quantidadeAtendida ?? 0);
  const id = String(o.id ?? `import-d${docIndex}-i${itemIndex}`).trim();
  if (!codigoMaterial) return null;
  const locRaw = String(o.localizacao ?? o['localização'] ?? '').trim();
  return {
    id,
    codigoMaterial,
    descricaoMaterial,
    unidade,
    quantidadeProjeto: Number.isFinite(quantidadeProjeto) ? quantidadeProjeto : 0,
    quantidadeAtendida: Number.isFinite(quantidadeAtendida) ? Math.max(0, quantidadeAtendida) : 0,
    localizacao: locRaw,
  };
}

type CadastroMaterialExport = {
  peso: number;
  disciplina: string;
  saldoAtual: number;
};

async function mapaCadastroMaterialPorCodigo(): Promise<Map<string, CadastroMaterialExport>> {
  const map = new Map<string, CadastroMaterialExport>();

  // Cadastro completo (mesma fonte do ecrã Editar material) — não usar list_page (limite 200).
  try {
    const materiais = await carregarMateriaisDoCadastro();
    for (const m of materiais) {
      const cod = codigoMaterialKey(m.codigo);
      if (!cod) continue;
      map.set(cod, {
        peso: roundPesoKg(typeof m.peso === 'number' ? m.peso : parseDecimalFlexible(String(m.peso ?? 0))),
        disciplina: String(m.disciplina ?? '').trim(),
        saldoAtual: Number(m.saldoAtual) || 0,
      });
    }
  } catch {
    /* tenta paginação RPC como fallback */
    const pageSize = 200;
    let page = 1;
    let total = Infinity;
    while ((page - 1) * pageSize < total) {
      const matResult = await listarMateriais({
        busca: '',
        disciplina: '',
        ativo: 'todos',
        page,
        pageSize,
      });
      if (!matResult.success || !matResult.data) break;
      total = Number(matResult.data.total) || matResult.data.items.length;
      for (const m of matResult.data.items) {
        const cod = codigoMaterialKey(m.codigo);
        if (!cod) continue;
        map.set(cod, {
          peso: roundPesoKg(typeof m.peso === 'number' ? m.peso : parseDecimalFlexible(String(m.peso ?? 0))),
          disciplina: String(m.disciplina ?? '').trim(),
          saldoAtual: Number(m.saldoAtual) || 0,
        });
      }
      if (matResult.data.items.length === 0) break;
      page += 1;
      if (page > 500) break;
    }
  }

  // Saldo operacional por cima do cadastro (não apaga peso/disciplina).
  if (shouldTryRemoteRead() || hasSupabaseConfig()) {
    try {
      const payload = await readSnapshotRemoteSliceOrFull<Record<string, unknown>>(SNAPSHOT_SALDO_SLICE_KEYS);
      const docsRec = documentosReconciliadosDoPayload(payload as PayloadPlanejamentoReconcile);
      const saldoMap = buildSaldoMap(
        montarSaldoPayloadComDocumentosReconciliados(payload as PayloadPlanejamentoReconcile, docsRec),
      );
      for (const [key, saldo] of saldoMap) {
        const cod = codigoMaterialKey(key);
        if (!cod) continue;
        const cur = map.get(cod) ?? { peso: 0, disciplina: '', saldoAtual: 0 };
        map.set(cod, { ...cur, saldoAtual: Number(saldo) || 0 });
      }
    } catch {
      /* mantém saldo do cadastro */
    }
  }

  return map;
}

/** Export CSV: cadastro leve via RPC de materiais (evita listRemoteMaterials PostgREST ~10–40s). */
async function mapaCadastroMaterialPorCodigoParaExportacao(): Promise<Map<string, CadastroMaterialExport>> {
  const map = new Map<string, CadastroMaterialExport>();

  if (hasSupabaseConfig()) {
    try {
      await ensureIsoProDataSessionReadable();
      const supabase = getSupabase();
      if (supabase) {
        const cloud = await fetchAllExportRpcPages<{
          codigo?: string;
          peso?: number;
          disciplina?: string;
        }>({
          supabase,
          rpcName: 'iso_pro_export_materiais_page',
          tenantId: getActiveTenantId(),
        });
        if (!cloud.missingRpc && !cloud.error) {
          for (const r of cloud.rows) {
            const cod = codigoMaterialKey(String(r.codigo ?? ''));
            if (!cod) continue;
            map.set(cod, {
              peso: roundPesoKg(Number(r.peso) || 0),
              disciplina: String(r.disciplina ?? '').trim(),
              saldoAtual: 0,
            });
          }
          return map;
        }
      }
    } catch {
      /* fallback abaixo */
    }
  }

  try {
    const materiais = await carregarMateriaisDoCadastro();
    for (const m of materiais) {
      const cod = codigoMaterialKey(m.codigo);
      if (!cod) continue;
      map.set(cod, {
        peso: roundPesoKg(typeof m.peso === 'number' ? m.peso : parseDecimalFlexible(String(m.peso ?? 0))),
        disciplina: String(m.disciplina ?? '').trim(),
        saldoAtual: Number(m.saldoAtual) || 0,
      });
    }
  } catch {
    return mapaCadastroMaterialPorCodigo();
  }
  return map;
}

/**
 * Antes: ao carregar documentos, o sistema podia **gravar** remocao de linhas ou de desenhos inteiros se
 * julgasse que o codigo nao existia no cadastro de materiais — efeito colateral perigoso e redundante.
 *
 * A regra de negocio correta e na **entrada**: sem material ativo cadastrado nao se grava documento
 * (`validarCodigosMateriaisAtivosNoCadastroParaRecebimento` em salvar/import). Por isso, ao **ler** a lista,
 * nunca alteramos o armazenamento; devolvemos o snapshot/local tal como esta.
 */
async function persistirLimpezaItensSemCadastroMaterial(documentos: Documento[]): Promise<Documento[]> {
  return documentos;
}

function labelStatusPlanejamentoCsv(status: ReturnType<typeof resolverStatusLinhaDocumento>): string {
  if (status === 'atendido') return 'Atendido';
  if (status === 'recebido') return 'Recebido';
  if (status === 'parcial') return 'Parcial';
  return 'Pendente';
}

function coletarCodigosMateriaisDaListaImportDocumentos(list: unknown[]): string[] {
  const set = new Set<string>();
  for (const doc of list) {
    if (!doc || typeof doc !== 'object') continue;
    const rawItens = (doc as { itens?: unknown }).itens;
    if (!Array.isArray(rawItens)) continue;
    for (const raw of rawItens) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const c = extrairCodigoMaterialDeObjetoImport(o);
      if (c) set.add(c);
    }
  }
  return [...set];
}

/** Preenche descricao_material vazia a partir do cadastro de materiais (mesmo codigo). */
async function enriquecerListaDocumentosImportComMateriais(lista: unknown[]): Promise<void> {
  let faltaDescricao = false;
  for (const doc of lista) {
    if (!doc || typeof doc !== 'object') continue;
    const rawItens = (doc as { itens?: unknown }).itens;
    if (!Array.isArray(rawItens)) continue;
    for (const raw of rawItens) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const cod = extrairCodigoMaterialDeObjetoImport(o);
      if (!cod) continue;
      const desc = String(o.descricaoMaterial ?? o.descricao_item ?? o.descricao ?? '').trim();
      if (!desc) {
        faltaDescricao = true;
        break;
      }
    }
    if (faltaDescricao) break;
  }
  if (!faltaDescricao) return;

  const matResult = await listarMateriais({
    busca: '',
    disciplina: '',
    ativo: 'ativos',
    page: 1,
    pageSize: 999999,
  });
  const byCodigo = new Map<string, string>();
  if (matResult.success && matResult.data) {
    for (const m of matResult.data.items) {
      byCodigo.set(m.codigo.toLowerCase(), m.descricao);
    }
  }

  for (const doc of lista) {
    if (!doc || typeof doc !== 'object') continue;
    const rawItens = (doc as { itens?: unknown }).itens;
    if (!Array.isArray(rawItens)) continue;
    for (const raw of rawItens) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const cod = extrairCodigoMaterialDeObjetoImport(o);
      if (!cod) continue;
      const desc = String(o.descricaoMaterial ?? o.descricao_item ?? o.descricao ?? '').trim();
      if (desc) continue;
      const nome = byCodigo.get(cod.toLowerCase());
      if (nome) {
        o.descricaoMaterial = nome;
      }
    }
  }
}

function normalizarDocumentoImportacao(
  raw: unknown,
  index: number,
):
  | { ok: false; message: string }
  | { ok: true; form: DocumentoFormData; idSugerido?: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: `Registro ${index + 1}: esperado um objeto de documento.` };
  }
  const o = raw as Record<string, unknown>;
  const numero = String(o.numero ?? '').trim();
  const revisao = String(o.revisao ?? 'A').trim();
  const descricao = String(o.descricao ?? '').trim();
  const responsavel = String(o.responsavel ?? '').trim();
  const dataDocumento = String(o.dataDocumento ?? o.data ?? '').trim();
  const observacao = String(o.observacao ?? '').trim();
  const rawItens = Array.isArray(o.itens) ? o.itens : [];
  const itens = rawItens
    .map((item, itemIndex) => normalizarItemImportacao(item, index, itemIndex))
    .filter((item): item is DocumentoItem => item !== null);

  const idRaw = o.id;
  const idSugerido =
    idRaw !== undefined && idRaw !== null && String(idRaw).trim() !== '' ? String(idRaw).trim() : undefined;

  return {
    ok: true,
    form: {
      numero,
      revisao,
      descricao,
      responsavel,
      dataDocumento,
      observacao,
      itens,
    },
    idSugerido,
  };
}

export type ExportacaoDocumentosOpcoes = {
  /** Quando informado, exporta apenas o que corresponderia aos filtros da tela (busca + status). */
  filtroLista?: Pick<DocumentoFiltro, 'busca' | 'status'>;
};

function exportacaoUsaFiltroRestrito(filtro: Pick<DocumentoFiltro, 'busca' | 'status'> | undefined) {
  return Boolean(filtro && (filtro.busca.trim() !== '' || filtro.status !== 'todos'));
}

export async function montarExportacaoDocumentosJson(
  opcoes?: ExportacaoDocumentosOpcoes,
): Promise<ServiceResult<{ json: string; fileName: string }>> {
  const loaded = await carregarTodosDocumentosOrdenados();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar documentos para exportar.' };
  }
  const documentos = opcoes?.filtroLista
    ? aplicarFiltrosListaDocumentos(loaded.data, opcoes.filtroLista)
    : loaded.data;
  const payload: DocumentosArquivoExportacao = {
    schemaVersion: DOCUMENTOS_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    documentos,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-documentos-${stamp}${sufixo}.json`;
  return { success: true, data: { json, fileName }, meta: loaded.meta };
}

/** Exportacao Excel/CSV: uma linha por item de material (detalhe), separador `;` para Excel em portugues. */
export async function montarExportacaoDocumentosCsvResumo(
  opcoes?: ExportacaoDocumentosOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const header = [
    'numero',
    'revisao',
    'descricao_documento',
    'responsavel',
    'data_documento',
    'status_documento',
    'codigo_material',
    'descricao_material',
    'localizacao_planejamento',
    'localizacao_consolidada',
    'disciplina',
    'unidade',
    'quantidade_documento',
    'quantidade_atendida',
    'quantidade_pendente_atendimento',
    'quantidade_prevista',
    'quantidade_atendida_global',
    'quantidade_recebida',
    'status_planejamento',
    'peso_unitario',
    'peso_total_documento',
    'peso_total_atendido_documento',
    'saldo_material',
  ];
  const sep = ';';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-documentos-itens-${stamp}${sufixo}.csv`;

  // Um pedido: CSV final no servidor (tudo ou filtro) — sem full-fetch + filtro no browser.
  if (hasSupabaseConfig()) {
    try {
      const finalCsv = await listExportDocumentosCsvFinalFromCloud({
        busca: opcoes?.filtroLista?.busca,
        status: opcoes?.filtroLista?.status,
      });
      if (!finalCsv.missingRpc && !finalCsv.error) {
        const body = finalCsv.chunk;
        const csv = `\uFEFF${header.join(sep)}${body ? `\r\n${body}` : ''}\r\n`;
        return {
          success: true,
          data: { csv, fileName },
          meta: { source: 'supabase' },
        };
      }
    } catch {
      /* cai no caminho paginado */
    }
  }

  // Fallback legado: CSV leve paginado ou JSON + locs/cadastro/recebido.
  if (hasSupabaseConfig()) {
    const [exportCloud, locsRpc, cadastroPorCodigo, recebidoPorCodigo] = await Promise.all([
      listExportDocumentosItensRowsFromCloud(),
      fetchLocalizacoesRecebimentoPorCodigo().catch(() => null),
      mapaCadastroMaterialPorCodigoParaExportacao(),
      fetchQuantidadeRecebidaPorCodigo().catch(() => null),
    ]);

    // RPC presente (mesmo com 0 linhas): não descer para o caminho lento PostgREST.
    if (!exportCloud.missingRpc && !exportCloud.error) {
      let rows = exportCloud.rows;
      const filtro = opcoes?.filtroLista;
      if (filtro && (filtro.busca.trim() !== '' || filtro.status !== 'todos')) {
        const busca = filtro.busca.trim().toLowerCase();
        rows = rows.filter((r) => {
          if (filtro.status !== 'todos' && String(r.status_documento) !== filtro.status) return false;
          if (!busca) return true;
          const blob = `${r.numero} ${r.descricao_documento} ${r.responsavel}`.toLowerCase();
          return blob.includes(busca);
        });
      }

      // prevista/atendido a partir das linhas exportadas; recebido via RPC leve.
      const metricasPorCodigo = new Map<string, MetricasPorCodigoMaterial>();
      for (const r of rows) {
        const cod = codigoMaterialKey(r.codigo_material);
        if (!cod) continue;
        const cur = metricasPorCodigo.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
        cur.prevista += Math.max(0, Number(r.quantidade_documento) || 0);
        cur.atendido += Math.max(0, Number(r.quantidade_atendida) || 0);
        metricasPorCodigo.set(cod, cur);
      }
      if (recebidoPorCodigo) {
        for (const [cod, qtd] of recebidoPorCodigo) {
          const key = codigoMaterialKey(cod);
          if (!key) continue;
          const cur = metricasPorCodigo.get(key) ?? { prevista: 0, recebido: 0, atendido: 0 };
          cur.recebido = Number(qtd) || 0;
          metricasPorCodigo.set(key, cur);
        }
      }

      const localizacoesRecebimentoPorCodigo = locsRpc ?? new Map<string, string>();

      const linhasDados: string[] = [];
      for (const r of rows) {
        const cod = codigoMaterialKey(r.codigo_material);
        const cad = cadastroPorCodigo.get(cod);
        const pesoUn = roundPesoKg(cad?.peso ?? 0);
        const disciplina = cad?.disciplina ?? '';
        const qDoc = Math.max(0, Number(r.quantidade_documento) || 0);
        const qAtdLin = Math.max(0, Number(r.quantidade_atendida) || 0);
        const qPendDoc = Math.max(0, qDoc - qAtdLin);
        const m = metricasPorCodigo.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
        const saldoMat = cad?.saldoAtual || Math.max(0, m.recebido - m.atendido);
        const itemFake = {
          id: String(r.item_id || ''),
          codigoMaterial: r.codigo_material,
          descricaoMaterial: r.descricao_material,
          unidade: r.unidade,
          quantidadeProjeto: qDoc,
          quantidadeAtendida: qAtdLin,
          localizacao: String(r.localizacao_planejamento ?? '').trim(),
        };
        const statusPl = resolverStatusLinhaDocumento(itemFake, metricasPorCodigo);
        const pesoTotDoc = roundPesoKg(qDoc * pesoUn);
        const pesoTotAtdDoc = roundPesoKg(qAtdLin * pesoUn);
        const locPlan = String(r.localizacao_planejamento ?? '').trim();
        const locConsol = resolverLocalizacaoExibicaoPlanejamento(itemFake, localizacoesRecebimentoPorCodigo);

        linhasDados.push(
          [
            r.numero,
            r.revisao,
            r.descricao_documento,
            r.responsavel,
            r.data_documento ?? '',
            r.status_documento,
            r.codigo_material,
            r.descricao_material,
            locPlan,
            locConsol,
            disciplina,
            r.unidade,
            formatDecimalExcelPtBr(qDoc),
            formatDecimalExcelPtBr(qAtdLin),
            formatDecimalExcelPtBr(qPendDoc),
            formatDecimalExcelPtBr(m.prevista),
            formatDecimalExcelPtBr(m.atendido),
            formatDecimalExcelPtBr(m.recebido),
            labelStatusPlanejamentoCsv(statusPl),
            formatDecimalExcelPtBr(pesoUn),
            formatDecimalExcelPtBr(pesoTotDoc),
            formatDecimalExcelPtBr(pesoTotAtdDoc),
            formatDecimalExcelPtBr(saldoMat),
          ]
            .map((c) => escapeCsvCellSemicolon(String(c)))
            .join(sep),
        );
      }

      const csv = `\uFEFF${[header.join(sep), ...linhasDados].join('\r\n')}\r\n`;
      return {
        success: true,
        data: { csv, fileName },
        meta: { source: 'supabase' },
      };
    }
  }

  // Fallback: caminho antigo (tabelas paginadas / local).
  const loaded = await carregarDocumentosParaExportacaoCsv();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar documentos para exportar.' };
  }
  const documentos = opcoes?.filtroLista
    ? aplicarFiltrosListaDocumentos(loaded.data, opcoes.filtroLista)
    : loaded.data;

  const [metricasRpc, locsRpc, cadastroPorCodigo] = await Promise.all([
    fetchMetricasPlanejamentoPorCodigo().catch(() => null),
    fetchLocalizacoesRecebimentoPorCodigo().catch(() => null),
    mapaCadastroMaterialPorCodigoParaExportacao(),
  ]);

  let metricasPorCodigo = metricasRpc;
  let localizacoesRecebimentoPorCodigo = locsRpc ?? new Map<string, string>();

  if (!metricasPorCodigo) {
    const recebimentos = await carregarRecebimentosCompletos();
    metricasPorCodigo = montarMetricasPorCodigoMaterial(loaded.data, recebimentos);
    if (!locsRpc) {
      localizacoesRecebimentoPorCodigo = montarLocalizacoesPorCodigoMaterial(recebimentos);
    }
  }

  const linhasDados: string[] = [];

  for (const doc of documentos) {
    for (const item of doc.itens) {
      const cod = codigoMaterialKey(item.codigoMaterial);
      const cad = cadastroPorCodigo.get(cod);
      const pesoUn = roundPesoKg(cad?.peso ?? 0);
      const disciplina = cad?.disciplina ?? '';
      const saldoMat = cad?.saldoAtual ?? 0;
      const qDoc = Math.max(0, Number(item.quantidadeProjeto) || 0);
      const qAtdLin = Math.max(0, Number(item.quantidadeAtendida) || 0);
      const qPendDoc = Math.max(0, qDoc - qAtdLin);
      const m = metricasPorCodigo.get(cod) ?? { prevista: 0, recebido: 0, atendido: 0 };
      const qPrevista = m.prevista;
      const qAtdGlobal = m.atendido;
      const qRecebida = m.recebido;
      const statusPl = resolverStatusLinhaDocumento(item, metricasPorCodigo);
      const pesoTotDoc = roundPesoKg(qDoc * pesoUn);
      const pesoTotAtdDoc = roundPesoKg(qAtdLin * pesoUn);

      linhasDados.push(
        [
          doc.numero,
          doc.revisao,
          doc.descricao,
          doc.responsavel,
          doc.dataDocumento,
          doc.status,
          item.codigoMaterial,
          item.descricaoMaterial,
          (item.localizacao ?? '').trim(),
          resolverLocalizacaoExibicaoPlanejamento(item, localizacoesRecebimentoPorCodigo),
          disciplina,
          item.unidade,
          formatDecimalExcelPtBr(qDoc),
          formatDecimalExcelPtBr(qAtdLin),
          formatDecimalExcelPtBr(qPendDoc),
          formatDecimalExcelPtBr(qPrevista),
          formatDecimalExcelPtBr(qAtdGlobal),
          formatDecimalExcelPtBr(qRecebida),
          labelStatusPlanejamentoCsv(statusPl),
          formatDecimalExcelPtBr(pesoUn),
          formatDecimalExcelPtBr(pesoTotDoc),
          formatDecimalExcelPtBr(pesoTotAtdDoc),
          formatDecimalExcelPtBr(saldoMat),
        ]
          .map((c) => escapeCsvCellSemicolon(String(c)))
          .join(sep),
      );
    }
  }

  const csv = `\uFEFF${[header.join(sep), ...linhasDados].join('\r\n')}\r\n`;
  return { success: true, data: { csv, fileName }, meta: loaded.meta };
}

export type ImportarDocumentosOpcoes = {
  /** Remove atendimentos/historico que referenciam desenhos fora do planejamento importado. */
  substituirELimparHistoricoIncompativel?: boolean;
  actorLogin?: string;
  /**
   * Se true: ao criar/actualizar um numero+revisao, cancela outras revisões activas do mesmo número
   * (não cancela a revisão importada). Pedido explícito na UI — nunca silencioso.
   */
  cancelarRevisoesAntigasActivas?: boolean;
  onProgress?: (mensagem: string) => void;
};

export async function importarDocumentosDoArquivoJson(
  text: string,
  opcoes?: ImportarDocumentosOpcoes,
): Promise<ServiceResult<DocumentosImportacaoResumo>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { success: false, error: 'Arquivo JSON invalido ou corrompido.' };
  }

  const lista = extrairListaDocumentosDoImport(parsed);
  if (!lista.ok) {
    return { success: false, error: lista.error };
  }
  if (!lista.list.length) {
    return { success: false, error: 'Nenhum documento encontrado no arquivo.' };
  }

  opcoes?.onProgress?.('A preparar o planejamento…');
  await enriquecerListaDocumentosImportComMateriais(lista.list);

  const codigosImportTodos = coletarCodigosMateriaisDaListaImportDocumentos(lista.list);
  const usarRewriteCompleto = opcoes?.substituirELimparHistoricoIncompativel === true;

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const seenKeys = new Set<string>();

  let indice: DocumentoIndiceImport[] = [];
  let working: Documento[] = [];
  let recebimentos: Awaited<ReturnType<typeof carregarRecebimentosCompletos>> = [];
  const deltaPorId = new Map<string, Documento>();

  try {
    const preflightPromise = validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
      codigosImportTodos,
      'import',
      'documento',
    );
    if (usarRewriteCompleto) {
      const [preflightMat, baseline, recs] = await Promise.all([
        preflightPromise,
        carregarDocumentosBaselineParaImportacao(),
        carregarRecebimentosCompletos({ semCadastroMateriais: true }),
      ]);
      if (preflightMat) return { success: false, error: preflightMat };
      recebimentos = recs;
      working = aplicarStatusPlanejamentoEmDocumentos([...baseline], recebimentos);
      indice = working.map((d) => ({
        id: d.id,
        numero: d.numero,
        revisao: d.revisao,
        status: d.status,
      }));
    } else {
      const [preflightMat, indiceNuvem, recs] = await Promise.all([
        preflightPromise,
        carregarIndiceDocumentosParaImportacao(),
        carregarRecebimentosCompletos({ semCadastroMateriais: true }),
      ]);
      if (preflightMat) return { success: false, error: preflightMat };
      indice = indiceNuvem;
      recebimentos = recs;
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar documentos antes da importacao.',
    };
  }

  const podeEditarDocImportPorChave = new Map<string, boolean>();
  for (const d of indice) {
    const k = `${d.numero.toLowerCase()}|${d.revisao.toLowerCase()}`;
    podeEditarDocImportPorChave.set(k, d.status === 'pendente');
  }
  const indicePorChave = new Map<string, DocumentoIndiceImport>(
    indice.map((d) => [`${d.numero.trim().toLowerCase()}|${d.revisao.trim().toLowerCase()}`, d]),
  );

  const cooperativeMerge = lista.list.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;
  const chavesImportAplicadas: Array<{ numero: string; revisao: string }> = [];

  for (let i = 0; i < lista.list.length; i++) {
    const norm = normalizarDocumentoImportacao(lista.list[i], i);
    if (!norm.ok) {
      detalhes.push(norm.message);
      ignorados += 1;
      continue;
    }

    const { form, idSugerido } = norm;
    const key = `${form.numero.toLowerCase()}|${form.revisao.toLowerCase()}`;
    if (!form.numero.trim()) {
      detalhes.push(`Registro ${i + 1}: numero obrigatorio.`);
      ignorados += 1;
      continue;
    }
    if (seenKeys.has(key)) {
      detalhes.push(`${form.numero} rev. ${form.revisao}: duplicado no mesmo arquivo (ignorado).`);
      ignorados += 1;
      continue;
    }
    seenKeys.add(key);

    const validationError = validateDocumento(form);
    if (validationError) {
      detalhes.push(`${form.numero} rev. ${form.revisao}: ${validationError}`);
      ignorados += 1;
      continue;
    }

    const existente = indicePorChave.get(key);

    if (existente) {
      if (!podeEditarDocImportPorChave.get(key)) {
        detalhes.push(
          `${form.numero} rev. ${form.revisao}: ja existe e nao esta pendente (apenas documentos pendentes sao atualizados por importacao).`,
        );
        ignorados += 1;
        continue;
      }
      const mapped: Documento = {
        ...form,
        id: existente.id,
        status: 'pendente',
      };
      if (usarRewriteCompleto) {
        const idx = working.findIndex((d) => d.id === existente.id);
        if (idx >= 0) working[idx] = mapped;
      }
      deltaPorId.set(mapped.id, mapped);
      atualizados += 1;
      detalhes.push(`${form.numero} rev. ${form.revisao}: atualizado.`);
      chavesImportAplicadas.push({ numero: form.numero, revisao: form.revisao });
    } else {
      let newId = idSugerido && !indicePorChave.has(key) && !indice.some((d) => d.id === idSugerido)
        ? idSugerido
        : crypto.randomUUID();
      if (indice.some((d) => d.id === newId) || deltaPorId.has(newId)) {
        newId = crypto.randomUUID();
      }
      const created: Documento = {
        ...form,
        id: newId,
        status: 'pendente',
      };
      if (usarRewriteCompleto) {
        working.push(created);
      }
      indicePorChave.set(key, {
        id: created.id,
        numero: created.numero,
        revisao: created.revisao,
        status: created.status,
      });
      indice.push({
        id: created.id,
        numero: created.numero,
        revisao: created.revisao,
        status: created.status,
      });
      deltaPorId.set(created.id, created);
      criados += 1;
      detalhes.push(`${form.numero} rev. ${form.revisao}: incluido.`);
      chavesImportAplicadas.push({ numero: form.numero, revisao: form.revisao });
    }

    if (cooperativeMerge) {
      await yieldCooperativeEveryRows(i);
    }
  }

  let canceladosPorRevisao = 0;
  if (opcoes?.cancelarRevisoesAntigasActivas && chavesImportAplicadas.length > 0) {
    const antigas = coletarRevisoesActivasOutrasParaChaves(indice, chavesImportAplicadas);
    const revisaoNovaPorNumero = new Map<string, string>();
    for (const c of chavesImportAplicadas) {
      revisaoNovaPorNumero.set(c.numero.trim().toLowerCase(), c.revisao.trim());
    }
    for (const antiga of antigas) {
      const revisaoNova = revisaoNovaPorNumero.get(antiga.numero.trim().toLowerCase()) ?? '?';
      const motivo = motivoCancelamentoSubstituidoPorRevisao(antiga.numero, revisaoNova);

      let cancelado: Documento | null = null;
      if (usarRewriteCompleto) {
        const idx = working.findIndex((d) => d.id === antiga.id);
        if (idx === -1 || working[idx].status === 'cancelado') continue;
        working[idx] = { ...working[idx], status: 'cancelado' };
        cancelado = working[idx];
      } else {
        const cloud = await readDocumentoPlanejamentoFromCloud({ id: antiga.id });
        if (!cloud.documento) continue;
        cancelado = {
          ...documentoFromPlanejamentoWire(cloud.documento, antiga.id),
          status: 'cancelado',
        };
      }
      if (!cancelado) continue;

      deltaPorId.set(cancelado.id, cancelado);
      canceladosPorRevisao += 1;
      detalhes.push(
        `${antiga.numero} rev. ${antiga.revisao}: cancelado (substituida pela rev. ${revisaoNova}). Motivo: ${motivo}`,
      );
      auditarCancelamentoDocumento(cancelado, antiga.status, {
        motivoAdministrativo: motivo,
        actorLogin: opcoes?.actorLogin,
      });
    }
  }

  let delta = [...deltaPorId.values()];
  if (delta.length > 0) {
    delta = aplicarStatusPlanejamentoEmDocumentos(delta, recebimentos);
    for (const d of delta) deltaPorId.set(d.id, d);
    delta = [...deltaPorId.values()];
    if (usarRewriteCompleto) {
      working = aplicarStatusPlanejamentoEmDocumentos(working, recebimentos);
    }
  }

  const resumo: DocumentosImportacaoResumo = {
    criados,
    atualizados,
    ignorados,
    detalhes,
    canceladosPorRevisao,
  };

  if (criados === 0 && atualizados === 0 && canceladosPorRevisao === 0) {
    return {
      success: false,
      error: 'Nenhuma alteracao aplicada. Revise o arquivo e os avisos acima.',
      data: resumo,
    };
  }

  if (hasSupabaseConfig()) {
    await yieldToMain();
    opcoes?.onProgress?.('A gravar na nuvem…');
    if (usarRewriteCompleto) {
      const bloqueioImport = bloqueioSubstituicaoLocalDocumentos(working.length);
      if (bloqueioImport) {
        return { success: false, error: bloqueioImport, data: resumo };
      }
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: () =>
          writeSnapshotDocumentos(working, {
            limparHistoricoIncompativel: true,
            actorLogin: opcoes?.actorLogin,
          }),
        writeLocal: () => writeAll(working),
        successData: resumo,
        fallbackMessage: 'Falha ao importar documentos no Supabase.',
      });
    }

    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () =>
        writeDocumentosImportDeltaOnCloud(delta, indice, {
          actorLogin: opcoes?.actorLogin,
          onProgress: opcoes?.onProgress,
        }),
      writeLocal: () => mesclarDeltaDocumentosNoLocalStorage(delta),
      successData: resumo,
      fallbackMessage: 'Falha ao importar documentos no Supabase.',
    });
  }

  const blockedImport = whenBusinessWriteBlockedResult<DocumentosImportacaoResumo>();
  if (blockedImport) return blockedImport;
  if (usarRewriteCompleto) {
    writeAll(working);
  } else {
    mesclarDeltaDocumentosNoLocalStorage(delta);
  }
  return { success: true, data: resumo, meta: { source: 'local' } };
}

/**
 * CSV modelo para importacao: cabecalho + linhas de exemplo (dois itens do mesmo documento e um segundo documento).
 * Separador ponto-e-virgula, UTF-8 com BOM — compativel com Excel em portugues.
 * Todas as linhas do mesmo numero+revisao devem ficar juntas (sem intercalacoes).
 */
export function montarModeloCsvImportacaoDocumentos(): { csv: string; fileName: string } {
  const sep = ';';
  const header = [
    'numero',
    'revisao',
    'descricao',
    'responsavel',
    'data_documento',
    'observacao',
    'codigo_material',
    'descricao_material',
    'unidade',
    'quantidade_projeto',
    'quantidade_atendida',
  ];

  const rows: string[][] = [
    [
      'DOC-EXEMPLO-001',
      'A',
      'Exemplo: primeiro documento (repita numero/revisao em cada linha de item)',
      'Maria Silva',
      '2026-04-02',
      '',
      'MAT-0001',
      'Tubo inox 2 polegadas',
      'UN',
      '10',
      '0',
    ],
    [
      'DOC-EXEMPLO-001',
      'A',
      'Exemplo: primeiro documento (repita numero/revisao em cada linha de item)',
      'Maria Silva',
      '2026-04-02',
      '',
      'MAT-0002',
      'Cabo eletrico 10mm',
      'M',
      '25',
      '0',
    ],
    [
      'DOC-EXEMPLO-002',
      'B',
      'Segundo documento no mesmo arquivo',
      'Joao Souza',
      '2026-04-03',
      'Observacao opcional do documento',
      'MAT-0001',
      'Tubo inox 2 polegadas',
      'UN',
      '5',
      '0',
    ],
  ];

  const lines = [
    header.join(sep),
    ...rows.map((r) => r.map((c) => escapeCsvCellSemicolon(c)).join(sep)),
  ];
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  return { csv, fileName: 'iso-pro-documentos-modelo-importacao.csv' };
}

/** Importacao a partir de planilha Excel (CSV): uma linha por item; converte para JSON e reutiliza a mesma regra do import JSON. */
export async function importarDocumentosDoArquivoCsv(
  text: string,
  opcoes?: ImportarDocumentosOpcoes,
): Promise<ServiceResult<DocumentosImportacaoResumo>> {
  opcoes?.onProgress?.('A preparar o planejamento…');
  const built = await construirJsonImportacaoDocumentosPlanoCsv(text);
  if (!built.ok) {
    return { success: false, error: built.error };
  }
  return importarDocumentosDoArquivoJson(built.json, opcoes);
}

/**
 * Actualiza apenas o campo descricao de documentos ja existentes (qualquer status).
 * Nao cria documentos, nao altera itens/quantidades — para corrigir descricoes em branco.
 */
export async function atualizarDescricoesDocumentosDoArquivoCsv(
  text: string,
): Promise<ServiceResult<DocumentosImportacaoResumo>> {
  const extracted = await extrairDescricoesDocumentosDoCsv(text);
  if (!extracted.ok) {
    return { success: false, error: extracted.error };
  }

  let working = await loadDocumentos();
  const detalhes: string[] = [];
  let atualizados = 0;
  let ignorados = 0;
  const seen = new Set<string>();

  for (const row of extracted.itens) {
    const key = `${row.numero.toLowerCase()}|${row.revisao.toLowerCase()}`;
    if (seen.has(key)) {
      ignorados += 1;
      detalhes.push(`${row.numero} rev. ${row.revisao}: duplicado no ficheiro (ignorado).`);
      continue;
    }
    seen.add(key);

    const desc = row.descricao.trim();
    if (!desc) {
      ignorados += 1;
      detalhes.push(`${row.numero} rev. ${row.revisao}: descricao vazia (ignorado).`);
      continue;
    }

    const idx = working.findIndex(
      (d) =>
        d.numero.trim().toLowerCase() === row.numero.trim().toLowerCase() &&
        d.revisao.trim().toLowerCase() === row.revisao.trim().toLowerCase(),
    );
    if (idx === -1) {
      ignorados += 1;
      detalhes.push(`${row.numero} rev. ${row.revisao}: nao encontrado na base (ignorado).`);
      continue;
    }

    const actual = (working[idx].descricao ?? '').trim();
    if (actual === desc) {
      ignorados += 1;
      detalhes.push(`${row.numero} rev. ${row.revisao}: descricao ja estava correcta (sem alteracao).`);
      continue;
    }

    working[idx] = { ...working[idx], descricao: desc };
    atualizados += 1;
    detalhes.push(
      `${row.numero} rev. ${row.revisao}: descricao actualizada${actual ? ` (era «${actual}»)` : ' (estava vazia)'}.`,
    );
  }

  const resumo: DocumentosImportacaoResumo = {
    criados: 0,
    atualizados,
    ignorados,
    detalhes,
  };

  if (atualizados === 0) {
    return {
      success: false,
      error: 'Nenhuma descricao actualizada. Revise o ficheiro e os avisos abaixo.',
      data: resumo,
    };
  }

  if (hasSupabaseConfig()) {
    await yieldToMain();
    const bloqueio = bloqueioSubstituicaoLocalDocumentos(working.length);
    if (bloqueio) {
      return { success: false, error: bloqueio, data: resumo };
    }
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () => writeSnapshotDocumentos(working),
      writeLocal: () => writeAll(working),
      successData: resumo,
      fallbackMessage: 'Falha ao gravar descricoes no Supabase.',
    });
  }

  const blocked = whenBusinessWriteBlockedResult<DocumentosImportacaoResumo>();
  if (blocked) return blocked;
  writeAll(working);
  return { success: true, data: resumo, meta: { source: 'local' } };
}
