import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { extrairCodigoMaterialDeObjetoImport } from '../../../lib/codigoMaterialImport';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { parseDocumentosImportJsonRoot } from '../../../lib/schemas/importArquivoPlano.zod';
import { readRemoteOrLocal, shouldTryRemoteRead } from '../../../lib/dataReadPolicy';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  contarRegistosArrayLocalStorage,
  mensagemSeSubstituirLocalPerderiaCadastros,
} from '../../../lib/localSnapshotWriteGuard';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import { listarMateriais, validarCodigosMateriaisAtivosNoCadastroParaRecebimento, carregarMateriaisDoCadastro } from '../../materiais/services/materiais.service';
import {
  commitIsoProSnapshotPatch,
  invalidateIsoProSnapshotCache,
  readIsoProSnapshotSlicesForWrite,
  SNAPSHOT_PLANEJAMENTO_SLICE_KEYS,
  SNAPSHOT_SALDO_SLICE_KEYS,
} from '../../../lib/isoProSnapshot';
import { readSnapshotRemoteSliceOrFull } from '../../../lib/snapshotSliceRead';
import { buildSaldoMap, codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import { upsertDocumentosPlanejamentoEmLotes, listDocumentosPlanejamentoPageFromCloud, listDocumentosPlanejamentoIdsFromCloud } from '../../../lib/documentosPlanejamentoTabelas';
import { runDualWriteBestEffort } from '../../../lib/dualWriteEscala';
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
import { construirJsonImportacaoDocumentosPlanoCsv } from './documentos.import.csv';
import { imprimirPlanejamentoCampoHtml } from '../utils/imprimirPlanejamentoCampoHtml';
import {
  aplicarStatusPlanejamentoEmDocumentos,
  montarLocalizacoesPorCodigoMaterial,
  montarMetricasPorCodigoMaterial,
  resolverLocalizacaoExibicaoPlanejamento,
  resolverStatusLinhaDocumento,
  type MetricasPorCodigoMaterial,
} from './documentoPlanejamento';
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

export { previewImportacaoDocumentosCsv } from './documentos.import.csv';

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
  const raw = localStorage.getItem(documentosStorageKey());
  if (!raw) {
    localStorage.setItem(documentosStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseDocumentosPersistidos(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Documentos (planejamento)', documentosStorageKey());
      return [];
    }
    return validated;
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Documentos (planejamento)', documentosStorageKey());
    return [];
  }
}

function writeAll(items: Documento[]) {
  localStorage.setItem(documentosStorageKey(), JSON.stringify(items));
  invalidatePlanejamentoDocumentosBundle();
}

async function loadDocumentos(): Promise<Documento[]> {
  const base = await readRemoteOrLocal({
    readRemote: readSnapshotDocumentos,
    readLocal: readAll,
  });
  return persistirLimpezaItensSemCadastroMaterial(base);
}

/**
 * Baseline da importacao: com nuvem configurada, le SEMPRE o snapshot remoto — sem fallback local.
 * Usar a copia local como base (ex.: seed demo num posto novo, ou sessao com leitura falhada) faria a
 * gravacao substituir o planejamento da nuvem pela copia errada e apagar os desenhos existentes
 * (incidente de 12/07/2026). Falha de leitura => importacao cancelada, nada e alterado.
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
  await commitIsoProSnapshotPatch(async () => {
    const { slices: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotSlicesForWrite(
      SNAPSHOT_PLANEJAMENTO_SLICE_KEYS,
    );
    let payloadTrabalho = currentPayload as PayloadComRefsAtendimento;
    let removidosHistorico = 0;
    let removidosAtendimentos = 0;

    if (!opcoes?.substituicaoExplicitaDaNuvem) {
      const docsNuvem = Array.isArray((currentPayload as { documentos?: unknown }).documentos)
        ? ((currentPayload as { documentos: Array<{ id?: unknown; numero?: unknown; revisao?: unknown }> }).documentos)
        : [];
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

    const documentosWire = items.map((item) => ({
      id: item.id,
      numero: item.numero,
      revisao: item.revisao,
      data: item.dataDocumento,
      descricao: item.descricao,
      responsavel: item.responsavel,
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

    return {
      baselineUpdatedAt,
      patch: {
        ...(opcoes?.limparHistoricoIncompativel
          ? {
              atendimentoHistorico: payloadTrabalho.atendimentoHistorico,
              atendimentos: payloadTrabalho.atendimentos,
            }
          : {}),
        documentos: documentosWire,
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });

  // Dual-write Fase B: tabelas dedicadas em lotes (falha visível no painel se persistir).
  await runDualWriteBestEffort('documentos', async () => {
    const documentosWire = items.map((item) => ({
      id: item.id,
      numero: item.numero,
      revisao: item.revisao,
      data: item.dataDocumento,
      descricao: item.descricao,
      responsavel: item.responsavel,
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
    return upsertDocumentosPlanejamentoEmLotes(documentosWire);
  });
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

export async function listarDocumentos(
  filtro: DocumentoFiltro,
): Promise<ServiceResult<PaginatedResult<DocumentoListItem>>> {
  try {
    // Escala: lista paginada nas tabelas (não carrega 11k na memória).
    if (hasSupabaseConfig()) {
      const page = await listDocumentosPlanejamentoPageFromCloud({
        busca: filtro.busca,
        status: filtro.status,
        offset: (filtro.page - 1) * filtro.pageSize,
        limit: filtro.pageSize,
      });

      // Nao chamar sync_from_snapshot aqui — em 1k+ desenhos causa timeout e lista vazia.

      if (!page.error && page.source === 'tables') {
        const items: DocumentoListItem[] = page.documentos.map((d) => {
          const statusRaw = String(d.status ?? 'pendente');
          const status = (
            ['pendente', 'parcial', 'recebido', 'atendido', 'cancelado'].includes(statusRaw)
              ? statusRaw
              : 'pendente'
          ) as Documento['status'];
          return {
            id: String(d.id ?? ''),
            numero: String(d.numero ?? ''),
            revisao: String(d.revisao ?? 'A'),
            descricao: String(d.descricao ?? ''),
            responsavel: String(d.responsavel ?? ''),
            dataDocumento: String(d.data ?? '').slice(0, 10),
            status,
            totalItens: Number(d.totalItens) || 0,
            quantidadePlanejada: Number(d.quantidadePlanejada) || 0,
            quantidadeAtendida: Number(d.quantidadeAtendida) || 0,
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
            ...(page.total === 0
              ? { fallbackReason: 'Nenhum desenho nas tabelas de escala para este filtro.' }
              : {}),
          },
        };
      }

      // Nunca cair no seed local DOC-1001/1002 com Supabase ligado — mascara a nuvem.
      return {
        success: true,
        data: {
          items: [],
          total: 0,
          page: filtro.page,
          pageSize: filtro.pageSize,
        },
        meta: {
          source: 'supabase',
          fallbackReason:
            page.error ||
            'Nao foi possivel listar desenhos na nuvem. Saia, Ctrl+F5 e entre de novo.',
        },
      };
    }

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
      const cloud = await listDocumentosPlanejamentoIdsFromCloud({
        busca: filtro.busca,
        status: filtro.status,
      });
      if (!cloud.error && cloud.source === 'tables') {
        return { success: true, data: cloud.ids, meta: { source: 'supabase' } };
      }
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
        if (comStatus[index].status !== 'pendente') {
          return { success: false, error: 'Documentos com atendimento iniciado nao podem ser editados por este fluxo.' };
        }
        items[index] = { ...normalized, id: currentId, status: 'pendente' };
        items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
        const bloqueioLocal = bloqueioSubstituicaoLocalDocumentos(items.length);
        if (bloqueioLocal) {
          return { success: false, error: bloqueioLocal };
        }
        const successData = items[index];
        return executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotDocumentos(items),
          writeLocal: () => writeAll(items),
          successData,
          fallbackMessage: 'Falha ao salvar documento no Supabase.',
        });
      }

      const newId = crypto.randomUUID();
      items.push({ ...normalized, id: newId, status: 'pendente' });
      items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
      const bloqueioLocalNovo = bloqueioSubstituicaoLocalDocumentos(items.length);
      if (bloqueioLocalNovo) {
        return { success: false, error: bloqueioLocalNovo };
      }
      const successData = items.find((d) => d.id === newId)!;
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotDocumentos(items),
        writeLocal: () => writeAll(items),
        successData,
        fallbackMessage: 'Falha ao salvar documento no Supabase.',
      });
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
    if (comStatus[index].status !== 'pendente') {
      return { success: false, error: 'Documentos com atendimento iniciado nao podem ser editados por este fluxo.' };
    }

    items[index] = { ...normalized, id: currentId, status: 'pendente' };
    items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
    const blockedDocEdit = whenBusinessWriteBlockedResult<Documento>();
    if (blockedDocEdit) return blockedDocEdit;
    writeAll(items);
    return { success: true, data: items[index] };
  }

  const newId = crypto.randomUUID();
  items.push({ ...normalized, id: newId, status: 'pendente' });
  items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
  const blockedDocNovo = whenBusinessWriteBlockedResult<Documento>();
  if (blockedDocNovo) return blockedDocNovo;
  writeAll(items);
  return { success: true, data: items.find((d) => d.id === newId)! };
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

      const bloqueioLocalExcluir = bloqueioSubstituicaoLocalDocumentos(next.length);
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

/**
 * Localiza documento por id (comparacao em string) ou, se nao achar, pelo numero do desenho.
 * Cobre snapshot mobile (id numerico vs string) e casos em que o id no atendimento nao bate mas o numero sim.
 *
 * Faz duas passagens: se a lista enriquecida nao encontrar o desenho, repete no snapshot bruto
 * (ex.: diferenca de id entre modulos) para ainda obter numero/revisao para o recibo.
 */
export async function buscarDocumentoPorIdOuNumero(
  id: string,
  numeroFallback?: string | null,
): Promise<ServiceResult<Documento>> {
  const { enriched, recebimentos } = await obterBundlePlanejamentoDocumentos();
  const foundClean = localizarDocumentoNaLista(enriched, id, numeroFallback);
  if (foundClean) return { success: true, data: foundClean };

  const snapshotDocs = await readSnapshotDocumentos();
  const brutos = aplicarStatusPlanejamentoEmDocumentos(snapshotDocs, recebimentos);
  const foundRaw = localizarDocumentoNaLista(brutos, id, numeroFallback);
  if (foundRaw) return { success: true, data: foundRaw };

  return { success: false, error: 'Documento nao encontrado.' };
}

export async function buscarDocumentoPorId(id: string): Promise<ServiceResult<Documento>> {
  return buscarDocumentoPorIdOuNumero(id, null);
}

export async function carregarTodosDocumentosOrdenados(): Promise<ServiceResult<Documento[]>> {
  try {
    const { data, meta } = await carregarDocumentosBase();
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

/** Metragens globais por codigo (documentos + recebimentos) para colunas de status no editor e na visualizacao. */
export async function carregarMetricasPlanejamentoPorCodigo(): Promise<Map<string, MetricasPorCodigoMaterial>> {
  const { metricas } = await obterBundlePlanejamentoDocumentos();
  return metricas;
}

/** Metricas de status + mapa de localizacoes agregadas por codigo (recebimentos), numa unica leitura. */
export async function carregarMetricasELocalizacoesPlanejamentoPorCodigo(): Promise<{
  metricas: Map<string, MetricasPorCodigoMaterial>;
  localizacoesRecebimentoPorCodigo: Map<string, string>;
}> {
  const { metricas, localizacoesRecebimentoPorCodigo } = await obterBundlePlanejamentoDocumentos();
  return { metricas, localizacoesRecebimentoPorCodigo };
}

/** Aquece cache partilhado (documentos + recebimentos + metricas) ao entrar no modulo. */
export async function precarregarBundlePlanejamentoDocumentos(): Promise<void> {
  await obterBundlePlanejamentoDocumentos();
}

export type DocumentoPlanejamentoVisualizacao = {
  documento: Documento;
  metricas: Map<string, MetricasPorCodigoMaterial>;
  localizacoesRecebimentoPorCodigo: Map<string, string>;
};

/** Uma unica leitura do bundle para modal «Visualizar» (documento + metricas + localizacoes). */
export async function carregarDocumentoPlanejamentoParaVisualizacao(
  id: string,
): Promise<ServiceResult<DocumentoPlanejamentoVisualizacao>> {
  const bundle = await obterBundlePlanejamentoDocumentos();
  const foundClean = localizarDocumentoNaLista(bundle.enriched, id, null);
  if (foundClean) {
    return {
      success: true,
      data: {
        documento: foundClean,
        metricas: bundle.metricas,
        localizacoesRecebimentoPorCodigo: bundle.localizacoesRecebimentoPorCodigo,
      },
    };
  }

  const snapshotDocs = await readSnapshotDocumentos();
  const brutos = aplicarStatusPlanejamentoEmDocumentos(snapshotDocs, bundle.recebimentos);
  const foundRaw = localizarDocumentoNaLista(brutos, id, null);
  if (foundRaw) {
    return {
      success: true,
      data: {
        documento: foundRaw,
        metricas: bundle.metricas,
        localizacoesRecebimentoPorCodigo: bundle.localizacoesRecebimentoPorCodigo,
      },
    };
  }

  return { success: false, error: 'Documento nao encontrado.' };
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

  const bundle = await obterBundlePlanejamentoDocumentos();
  let doc = bundle.enriched.find((d) => d.id === item.id) ?? null;
  if (!doc) {
    const fallback = await buscarDocumentoPorId(item.id);
    if (!fallback.success || !fallback.data) {
      return { ok: false, error: fallback.error ?? 'Documento nao encontrado.' };
    }
    doc = fallback.data;
  }

  const ok = await imprimirPlanejamentoCampoHtml(
    doc,
    bundle.metricas,
    bundle.localizacoesRecebimentoPorCodigo,
  );
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
  const loaded = await carregarTodosDocumentosOrdenados();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar documentos para exportar.' };
  }
  const documentos = opcoes?.filtroLista
    ? aplicarFiltrosListaDocumentos(loaded.data, opcoes.filtroLista)
    : loaded.data;

  const recebimentos = await carregarRecebimentosCompletos();
  /** Metricas por codigo em todo o planejamento (documentos nao cancelados + recebimentos), como o relatorio legado. */
  const metricasPorCodigo = montarMetricasPorCodigoMaterial(loaded.data, recebimentos);
  const localizacoesRecebimentoPorCodigo = montarLocalizacoesPorCodigoMaterial(recebimentos);

  const cadastroPorCodigo = await mapaCadastroMaterialPorCodigo();

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

  const linhas = [header.join(sep), ...linhasDados];
  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-documentos-itens-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName }, meta: loaded.meta };
}

export type ImportarDocumentosOpcoes = {
  /** Remove atendimentos/historico que referenciam desenhos fora do planejamento importado. */
  substituirELimparHistoricoIncompativel?: boolean;
  actorLogin?: string;
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

  await enriquecerListaDocumentosImportComMateriais(lista.list);

  const codigosImportTodos = coletarCodigosMateriaisDaListaImportDocumentos(lista.list);
  const preflightMat = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
    codigosImportTodos,
    'import',
    'documento',
  );
  if (preflightMat) {
    return { success: false, error: preflightMat };
  }

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const seenKeys = new Set<string>();

  let working: Documento[];
  let recebimentos: Awaited<ReturnType<typeof carregarRecebimentosCompletos>>;
  try {
    working = [...(await carregarDocumentosBaselineParaImportacao())];
    recebimentos = await carregarRecebimentosCompletos();
    working = aplicarStatusPlanejamentoEmDocumentos(working, recebimentos);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar documentos antes da importacao.',
    };
  }

  const podeEditarDocImportPorChave = new Map<string, boolean>();
  for (const d of working) {
    const k = `${d.numero.toLowerCase()}|${d.revisao.toLowerCase()}`;
    podeEditarDocImportPorChave.set(k, d.status === 'pendente');
  }

  const cooperativeMerge = lista.list.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

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

    const idx = working.findIndex(
      (d) =>
        d.numero.trim().toLowerCase() === form.numero.trim().toLowerCase() &&
        d.revisao.trim().toLowerCase() === form.revisao.trim().toLowerCase(),
    );

    if (idx !== -1) {
      if (!podeEditarDocImportPorChave.get(key)) {
        detalhes.push(
          `${form.numero} rev. ${form.revisao}: ja existe e nao esta pendente (apenas documentos pendentes sao atualizados por importacao).`,
        );
        ignorados += 1;
        continue;
      }
      const id = working[idx].id;
      working[idx] = {
        ...form,
        id,
        status: 'pendente',
      };
      atualizados += 1;
      detalhes.push(`${form.numero} rev. ${form.revisao}: atualizado.`);
    } else {
      let newId = idSugerido && !working.some((d) => d.id === idSugerido) ? idSugerido : crypto.randomUUID();
      if (working.some((d) => d.id === newId)) {
        newId = crypto.randomUUID();
      }
      const created: Documento = {
        ...form,
        id: newId,
        status: 'pendente',
      };
      working.push(created);
      criados += 1;
      detalhes.push(`${form.numero} rev. ${form.revisao}: incluido.`);
    }

    if (cooperativeMerge) {
      await yieldCooperativeEveryRows(i);
    }
  }

  if (criados > 0 || atualizados > 0) {
    working = aplicarStatusPlanejamentoEmDocumentos(working, recebimentos);
  }

  const resumo: DocumentosImportacaoResumo = {
    criados,
    atualizados,
    ignorados,
    detalhes,
  };

  if (criados === 0 && atualizados === 0) {
    return {
      success: false,
      error: 'Nenhuma alteracao aplicada. Revise o arquivo e os avisos acima.',
      data: resumo,
    };
  }

  if (hasSupabaseConfig()) {
    await yieldToMain();
    const bloqueioImport = bloqueioSubstituicaoLocalDocumentos(working.length);
    if (bloqueioImport) {
      return { success: false, error: bloqueioImport, data: resumo };
    }
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () =>
        writeSnapshotDocumentos(working, {
          limparHistoricoIncompativel: opcoes?.substituirELimparHistoricoIncompativel === true,
          actorLogin: opcoes?.actorLogin,
        }),
      writeLocal: () => writeAll(working),
      successData: resumo,
      fallbackMessage: 'Falha ao importar documentos no Supabase.',
    });
  }

  const blockedImport = whenBusinessWriteBlockedResult<DocumentosImportacaoResumo>();
  if (blockedImport) return blockedImport;
  writeAll(working);
  return { success: true, data: resumo, meta: { source: 'local' } };
}

/**
 * CSV modelo para importacao: cabecalho + linhas de exemplo (dois itens do mesmo documento e um segundo documento).
 * Separador ponto-e-virgula, UTF-8 com BOM — compativel com Excel em portugues.
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
  const built = await construirJsonImportacaoDocumentosPlanoCsv(text);
  if (!built.ok) {
    return { success: false, error: built.error };
  }
  return importarDocumentosDoArquivoJson(built.json, opcoes);
}
