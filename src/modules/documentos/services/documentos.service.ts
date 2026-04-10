import { escapeCsvCellSemicolon } from '../../../lib/csv';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import { listarMateriais } from '../../materiais/services/materiais.service';
import {
  commitIsoProSnapshotWrite,
  invalidateIsoProSnapshotCache,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { validateDocumento } from '../schemas/documento.schema';
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
import {
  aplicarStatusPlanejamentoEmDocumentos,
  montarMetricasPorCodigoMaterial,
  resolverStatusLinhaDocumento,
  type MetricasPorCodigoMaterial,
} from './documentoPlanejamento';

export { previewImportacaoDocumentosCsv } from './documentos.import.csv';

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

const STORAGE_KEY = 'iso-pro-desktop-documentos';

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
      },
      {
        id: 'doc-1-item-2',
        codigoMaterial: 'EL-0102',
        descricaoMaterial: 'Cabo eletrico 10mm',
        unidade: 'M',
        quantidadeProjeto: 200,
        quantidadeAtendida: 0,
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
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }

  try {
    return JSON.parse(raw) as Documento[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }
}

function writeAll(items: Documento[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function loadDocumentos(): Promise<Documento[]> {
  const base = hasSupabaseConfig() ? await readSnapshotDocumentos().catch(() => readAll()) : readAll();
  return persistirLimpezaItensSemCadastroMaterial(base);
}

type SnapshotPayload = {
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
    }>;
  }>;
};

async function readSnapshotDocumentos(): Promise<Documento[]> {
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();

  return (payload.documentos ?? []).map((doc, index) => {
    const itens = (doc.itens ?? []).map((item, itemIndex) => ({
      id: String(item.id ?? `${doc.id ?? index}-item-${itemIndex + 1}`),
      codigoMaterial: String(item.codigo ?? ''),
      descricaoMaterial: String(item.descricao ?? ''),
      unidade: String(item.unidade ?? 'UN'),
      quantidadeProjeto: Number(item.quantidade ?? 0),
      quantidadeAtendida: Number(item.quantidadeAtendida ?? 0),
    }));

    const documentoBase: DocumentoFormData = {
      numero: String(doc.numero ?? ''),
      revisao: String(doc.revisao ?? 'A'),
      descricao: String(doc.descricao ?? ''),
      responsavel: String(doc.responsavel ?? ''),
      dataDocumento: String(doc.data ?? new Date().toISOString().slice(0, 10)),
      observacao: '',
      itens,
    };

    return {
      id: String(doc.id ?? `doc-${index + 1}`),
      ...documentoBase,
      status: deriveStatusSnapshot(documentoBase),
    };
  });
}

/** Quantidade de documentos guardados em `localStorage` neste navegador (chave `iso-pro-desktop-documentos`). */
export function contarDocumentosNoArmazenamentoLocal(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Compara planejamento local vs snapshot remoto. `noSnapshot === 0` com `noNavegador > 0` explica mobile sem desenhos apesar do Supabase OK.
 */
export async function diagnosticarPlanejamentoLocalVersusNuvem(): Promise<{
  noNavegador: number;
  noSnapshot: number;
}> {
  const noNavegador = contarDocumentosNoArmazenamentoLocal();
  if (!hasSupabaseConfig()) {
    return { noNavegador, noSnapshot: -1 };
  }
  try {
    const naNuvem = await loadDocumentos();
    return { noNavegador, noSnapshot: naNuvem.length };
  } catch {
    return { noNavegador, noSnapshot: -1 };
  }
}

/**
 * Substitui o array `documentos` no snapshot remoto pela copia deste navegador (`localStorage`).
 * Use quando o mobile nao ve desenhos: normalmente o PC esta em fallback local (consulta ao Supabase falhou) ou os dados nunca foram gravados na nuvem.
 */
export async function sincronizarPlanejamentoLocalComNuvem(): Promise<ServiceResult<{ total: number }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const items = readAll();
  try {
    await writeSnapshotDocumentos(items);
    return { success: true, data: { total: items.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao gravar planejamento na nuvem.',
    };
  }
}

async function writeSnapshotDocumentos(items: Documento[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        documentos: items.map((item) => ({
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
          })),
        })),
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
}

function buildSearchText(item: Documento) {
  return `${item.numero} ${item.descricao} ${item.responsavel}`.toLowerCase();
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
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: async () => persistirLimpezaItensSemCadastroMaterial(await readSnapshotDocumentos()),
    loadLocal: async () => persistirLimpezaItensSemCadastroMaterial(readAll()),
    fallbackMessage: 'Falha ao consultar documentos no Supabase.',
  });
  const recebimentos = await carregarRecebimentosCompletos();
  const comStatusPlanejamento = aplicarStatusPlanejamentoEmDocumentos(fallbackResult.data, recebimentos);
  const items = aplicarFiltrosListaDocumentos(comStatusPlanejamento, filtro);
  const { meta } = fallbackResult;

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
}

/** IDs de todos os documentos que correspondem ao filtro (ignora paginacao). */
export async function obterIdsDocumentosFiltrados(filtro: DocumentoFiltro): Promise<ServiceResult<string[]>> {
  try {
    const fallbackResult = await withLocalFallback({
      shouldTryRemote: hasSupabaseConfig(),
      loadRemote: async () => persistirLimpezaItensSemCadastroMaterial(await readSnapshotDocumentos()),
      loadLocal: async () => persistirLimpezaItensSemCadastroMaterial(readAll()),
      fallbackMessage: 'Falha ao consultar documentos no Supabase.',
    });
    const recebimentos = await carregarRecebimentosCompletos();
    const comStatus = aplicarStatusPlanejamentoEmDocumentos(fallbackResult.data, recebimentos);
    const filtered = aplicarFiltrosListaDocumentos(comStatus, filtro);
    return { success: true, data: filtered.map((d) => d.id) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao listar documentos.' };
  }
}

/** Numero/revisao para confirmacao na UI (mesma fonte que a listagem). */
export async function obterResumosDocumentosParaExclusao(
  ids: string[],
): Promise<ServiceResult<{ numero: string; revisao: string }[]>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { success: true, data: [] };
  try {
    const fallbackResult = await withLocalFallback({
      shouldTryRemote: hasSupabaseConfig(),
      loadRemote: async () => persistirLimpezaItensSemCadastroMaterial(await readSnapshotDocumentos()),
      loadLocal: async () => persistirLimpezaItensSemCadastroMaterial(readAll()),
      fallbackMessage: 'Falha ao consultar documentos no Supabase.',
    });
    const recebimentos = await carregarRecebimentosCompletos();
    const enriched = aplicarStatusPlanejamentoEmDocumentos(fallbackResult.data, recebimentos);
    const idSet = new Set(unique);
    const res = enriched
      .filter((d) => idSet.has(d.id))
      .map((d) => ({ numero: d.numero, revisao: d.revisao }))
      .sort((a, b) => a.numero.localeCompare(b.numero) || a.revisao.localeCompare(b.revisao));
    return { success: true, data: res };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao carregar resumo dos documentos.' };
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

  const codigosRes = await obterCodigosMateriaisCadastrados();
  if (!codigosRes.success || !codigosRes.data) {
    return { success: false, error: codigosRes.error ?? 'Falha ao validar codigos de materiais.' };
  }
  const matErr = validarDocumentoItensCadastradosMateriais(payload, codigosRes.data);
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
    writeAll(items);
    return { success: true, data: items[index] };
  }

  const newId = crypto.randomUUID();
  items.push({ ...normalized, id: newId, status: 'pendente' });
  items = aplicarStatusPlanejamentoEmDocumentos(items, recebimentos);
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

      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotDocumentos(next),
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

export async function buscarDocumentoPorId(id: string): Promise<ServiceResult<Documento>> {
  const fallback = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: async () => persistirLimpezaItensSemCadastroMaterial(await readSnapshotDocumentos()),
    loadLocal: async () => persistirLimpezaItensSemCadastroMaterial(readAll()),
    fallbackMessage: 'Falha ao consultar documentos no Supabase.',
  });
  const recebimentos = await carregarRecebimentosCompletos();
  const enriched = aplicarStatusPlanejamentoEmDocumentos(fallback.data, recebimentos);
  const item = enriched.find((documento) => documento.id === id);
  if (!item) return { success: false, error: 'Documento nao encontrado.' };
  return { success: true, data: item };
}

export async function carregarTodosDocumentosOrdenados(): Promise<ServiceResult<Documento[]>> {
  const fallback = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: async () => persistirLimpezaItensSemCadastroMaterial(await readSnapshotDocumentos()),
    loadLocal: async () => persistirLimpezaItensSemCadastroMaterial(readAll()),
    fallbackMessage: 'Falha ao consultar documentos no Supabase.',
  });
  const recebimentos = await carregarRecebimentosCompletos();
  const enriched = aplicarStatusPlanejamentoEmDocumentos(fallback.data, recebimentos);
  const items = [...enriched].sort(
    (a, b) => b.dataDocumento.localeCompare(a.dataDocumento) || a.numero.localeCompare(b.numero),
  );
  return { success: true, data: items, meta: fallback.meta };
}

/** Metragens globais por codigo (documentos + recebimentos) para colunas de status no editor e na visualizacao. */
export async function carregarMetricasPlanejamentoPorCodigo(): Promise<Map<string, MetricasPorCodigoMaterial>> {
  const fallback = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: async () => persistirLimpezaItensSemCadastroMaterial(await readSnapshotDocumentos()),
    loadLocal: async () => persistirLimpezaItensSemCadastroMaterial(readAll()),
    fallbackMessage: 'Falha ao consultar documentos no Supabase.',
  });
  const recebimentos = await carregarRecebimentosCompletos();
  return montarMetricasPorCodigoMaterial(fallback.data, recebimentos);
}

function extrairListaDocumentosDoImport(
  parsed: unknown,
): { ok: true; list: unknown[] } | { ok: false; error: string } {
  if (Array.isArray(parsed)) {
    return { ok: true, list: parsed };
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as DocumentosArquivoExportacao).documentos)
  ) {
    return { ok: true, list: (parsed as DocumentosArquivoExportacao).documentos };
  }
  return {
    ok: false,
    error: 'Formato invalido: use um array de documentos ou um objeto com a propriedade "documentos".',
  };
}

function normalizarItemImportacao(raw: unknown, docIndex: number, itemIndex: number): DocumentoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const codigoMaterial = String(o.codigoMaterial ?? o.codigo ?? '').trim();
  const descricaoMaterial = String(o.descricaoMaterial ?? o.descricao_item ?? o.descricao ?? '').trim();
  const unidadeRaw = String(o.unidade ?? 'UN').trim();
  const unidade = unidadeRaw || 'UN';
  const quantidadeProjeto = Number(o.quantidadeProjeto ?? o.quantidade ?? 0);
  const quantidadeAtendida = Number(o.quantidadeAtendida ?? 0);
  const id = String(o.id ?? `import-d${docIndex}-i${itemIndex}`).trim();
  if (!codigoMaterial) return null;
  return {
    id,
    codigoMaterial,
    descricaoMaterial,
    unidade,
    quantidadeProjeto: Number.isFinite(quantidadeProjeto) ? quantidadeProjeto : 0,
    quantidadeAtendida: Number.isFinite(quantidadeAtendida) ? Math.max(0, quantidadeAtendida) : 0,
  };
}

type CadastroMaterialExport = {
  peso: number;
  disciplina: string;
  saldoAtual: number;
};

async function mapaCadastroMaterialPorCodigo(): Promise<Map<string, CadastroMaterialExport>> {
  const matResult = await listarMateriais({
    busca: '',
    disciplina: '',
    ativo: 'todos',
    page: 1,
    pageSize: 999999,
  });
  const map = new Map<string, CadastroMaterialExport>();
  if (!matResult.success || !matResult.data) return map;
  for (const m of matResult.data.items) {
    const cod = m.codigo.trim().toLowerCase();
    if (!cod) continue;
    map.set(cod, {
      peso: Number(m.peso) || 0,
      disciplina: String(m.disciplina ?? '').trim(),
      saldoAtual: Number(m.saldoAtual) || 0,
    });
  }
  return map;
}

async function obterCodigosMateriaisCadastrados(): Promise<ServiceResult<Set<string>>> {
  const matResult = await listarMateriais({
    busca: '',
    disciplina: '',
    ativo: 'todos',
    page: 1,
    pageSize: 999999,
  });
  if (!matResult.success || !matResult.data) {
    return { success: false, error: 'Nao foi possivel consultar o cadastro de materiais para validar os codigos.' };
  }
  const set = new Set<string>();
  for (const m of matResult.data.items) {
    const c = m.codigo.trim().toLowerCase();
    if (c) set.add(c);
  }
  return { success: true, data: set };
}

/** Cada codigo de item do documento deve existir no modulo Materiais (comparacao sem diferenciar maiusculas/minusculas). */
function validarDocumentoItensCadastradosMateriais(
  payload: DocumentoFormData,
  codigosCadastrados: Set<string>,
): string | null {
  const invalid: string[] = [];
  for (const item of payload.itens) {
    const code = item.codigoMaterial.trim();
    if (!code) continue;
    if (!codigosCadastrados.has(code.toLowerCase())) {
      invalid.push(code);
    }
  }
  if (!invalid.length) return null;
  const uniq = [...new Set(invalid)];
  if (uniq.length === 1) {
    return `O codigo de material "${uniq[0]}" nao esta cadastrado em Materiais. Cadastre o material antes de usar no documento.`;
  }
  return `Codigos de material nao cadastrados em Materiais: ${uniq.join(', ')}. Cadastre os materiais antes de usar no documento.`;
}

/**
 * Remove linhas cujo codigo nao existe em Materiais e exclui documentos que ficarem sem itens.
 * Grava no snapshot / localStorage quando houver alteracao (corrige dados antigos antes da validacao).
 */
async function persistirLimpezaItensSemCadastroMaterial(documentos: Documento[]): Promise<Documento[]> {
  const codigosRes = await obterCodigosMateriaisCadastrados();
  if (!codigosRes.success || !codigosRes.data) {
    return documentos;
  }
  const permitidos = codigosRes.data;
  const cleaned: Documento[] = [];
  let alterou = false;

  for (const doc of documentos) {
    const itensOk = doc.itens.filter((it) => {
      const c = it.codigoMaterial.trim();
      return c && permitidos.has(c.toLowerCase());
    });
    if (itensOk.length === 0) {
      if (doc.itens.length > 0) alterou = true;
      continue;
    }
    if (itensOk.length !== doc.itens.length) alterou = true;
    cleaned.push({ ...doc, itens: itensOk });
  }

  if (cleaned.length !== documentos.length) {
    alterou = true;
  }

  if (!alterou) {
    return documentos;
  }

  const recebimentos = await carregarRecebimentosCompletos();
  const recomputados = aplicarStatusPlanejamentoEmDocumentos(cleaned, recebimentos);

  try {
    if (hasSupabaseConfig()) {
      try {
        await writeSnapshotDocumentos(recomputados);
      } catch {
        writeAll(recomputados);
      }
    } else {
      writeAll(recomputados);
    }
    invalidateIsoProSnapshotCache();
  } catch {
    /* retorna mesmo assim a visao ja saneada em memoria */
  }

  return recomputados;
}

function formatDecimalCsv(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const s = value.toFixed(6);
  return s.replace(/\.?0+$/, '') || '0';
}

function labelStatusPlanejamentoCsv(status: ReturnType<typeof resolverStatusLinhaDocumento>): string {
  if (status === 'atendido') return 'Atendido';
  if (status === 'recebido') return 'Recebido';
  if (status === 'parcial') return 'Parcial';
  return 'Pendente';
}

/** Preenche descricao_material vazia a partir do cadastro de materiais (mesmo codigo). */
async function enriquecerListaDocumentosImportComMateriais(lista: unknown[]): Promise<void> {
  const matResult = await listarMateriais({
    busca: '',
    disciplina: '',
    ativo: 'todos',
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
      const cod = String(o.codigoMaterial ?? o.codigo ?? '').trim();
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
      const cod = item.codigoMaterial.trim().toLowerCase();
      const cad = cadastroPorCodigo.get(cod);
      const pesoUn = cad?.peso ?? 0;
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
      const pesoTotDoc = qDoc * pesoUn;
      const pesoTotAtdDoc = qAtdLin * pesoUn;

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
          disciplina,
          item.unidade,
          formatDecimalCsv(qDoc),
          formatDecimalCsv(qAtdLin),
          formatDecimalCsv(qPendDoc),
          formatDecimalCsv(qPrevista),
          formatDecimalCsv(qAtdGlobal),
          formatDecimalCsv(qRecebida),
          labelStatusPlanejamentoCsv(statusPl),
          formatDecimalCsv(pesoUn),
          formatDecimalCsv(pesoTotDoc),
          formatDecimalCsv(pesoTotAtdDoc),
          formatDecimalCsv(saldoMat),
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

export async function importarDocumentosDoArquivoJson(
  text: string,
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

  const codigosCadRes = await obterCodigosMateriaisCadastrados();
  if (!codigosCadRes.success || !codigosCadRes.data) {
    return { success: false, error: codigosCadRes.error ?? 'Falha ao validar codigos de materiais na importacao.' };
  }
  const codigosCadastradosImport = codigosCadRes.data;

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const seenKeys = new Set<string>();

  let working: Documento[];
  let recebimentos: Awaited<ReturnType<typeof carregarRecebimentosCompletos>>;
  try {
    working = [...(await loadDocumentos())];
    recebimentos = await carregarRecebimentosCompletos();
    working = aplicarStatusPlanejamentoEmDocumentos(working, recebimentos);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar documentos antes da importacao.',
    };
  }

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

    const matErr = validarDocumentoItensCadastradosMateriais(form, codigosCadastradosImport);
    if (matErr) {
      detalhes.push(`${form.numero} rev. ${form.revisao}: ${matErr}`);
      ignorados += 1;
      continue;
    }

    const idx = working.findIndex(
      (d) =>
        d.numero.trim().toLowerCase() === form.numero.trim().toLowerCase() &&
        d.revisao.trim().toLowerCase() === form.revisao.trim().toLowerCase(),
    );

    if (idx !== -1) {
      if (working[idx].status !== 'pendente') {
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
      working = aplicarStatusPlanejamentoEmDocumentos(working, recebimentos);
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
      working = aplicarStatusPlanejamentoEmDocumentos(working, recebimentos);
      criados += 1;
      detalhes.push(`${form.numero} rev. ${form.revisao}: incluido.`);
    }
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
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () => writeSnapshotDocumentos(working),
      writeLocal: () => writeAll(working),
      successData: resumo,
      fallbackMessage: 'Falha ao importar documentos no Supabase.',
    });
  }

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
): Promise<ServiceResult<DocumentosImportacaoResumo>> {
  const built = construirJsonImportacaoDocumentosPlanoCsv(text);
  if (!built.ok) {
    return { success: false, error: built.error };
  }
  return importarDocumentosDoArquivoJson(built.json);
}
