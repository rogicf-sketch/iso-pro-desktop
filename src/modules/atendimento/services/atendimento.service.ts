import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { readRemoteOrLocal, shouldTryRemoteRead, withRemoteReadTimeout, REMOTE_READ_TIMEOUT_HEAVY_MS } from '../../../lib/dataReadPolicy';
import { isIsoProDesktop } from '../../../lib/pdfCloud/pdfCloudConfig';
import { traduzirErroOperacionalIsoPro } from '../../../lib/traduzirErroOperacionalIsoPro';
import { getSupabase, hasSupabaseConfig, shouldUseCloudMaterials } from '../../../lib/supabase';
import {
  readIsoProSnapshotSlicesForWrite,
  SNAPSHOT_ATENDIMENTO_HISTORICO_SLICE_KEYS,
  SNAPSHOT_ATENDIMENTO_LIGHT_SLICE_KEYS,
  SNAPSHOT_ATENDIMENTO_LIGHT_SEM_RECEBIMENTOS_SLICE_KEYS,
  SNAPSHOT_SALDO_AGREGADOS_SLICE_KEYS,
  SNAPSHOT_OPERATIONAL_SLICE_KEYS,
} from '../../../lib/isoProSnapshot';
import {
  fetchQuantidadeAtendidaPorCodigo,
  fetchQuantidadeRecebidaPorCodigo,
  listDocumentosPendentesAtendimentoFromCloud,
  listDocumentosPendentesPorCodigoMaterialFromCloud,
} from '../../../lib/operacaoEscalaContagens';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { readSnapshotRemoteSliceOrFull } from '../../../lib/snapshotSliceRead';
import { registrarAtividadeBackupOracle } from '../../../lib/backupOracleAuto.client';
import { mergeSnapshotRowsById } from '../../../lib/snapshotPatchMerge';
import { buildSaldoMap, codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import {
  documentosReconciliadosDoPayload,
  montarSaldoPayloadComDocumentosReconciliados,
  type DocumentoPlanejamentoStored,
} from '../../../lib/snapshotDocumentosReconciliacao';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { executeWrite } from '../../../lib/service-result';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import type { ServiceResult } from '../../../types/common.types';
import {
  buscarColaboradorPorId,
  listarColaboradoresAtivos,
  registrarRetiranteExterno,
} from '../../colaboradores/services/colaboradores.service';
import {
  encontrarLinhaDocumentoParaItemEstorno,
  numerosDocumentosDistintosItens,
  resolverIndiceDocumentoParaItemEstorno,
} from '../utils/estornoDocumento.utils';
import { resolverColaboradorPorTextoAtendente } from '../utils/resolverColaboradorPorTextoAtendente';
import {
  buildDesktopAtendimentoIdempotencyKey,
  gravarAtendimentoNaNuvemComComando,
} from './atendimentoComandoDesktop';
import type { SnapshotSlice } from './atendimentoSnapshotPatch';
import { consumirSequenciaAtendimento } from '../../configuracoes/services/configuracoes.service';
import { chaveAgrupamentoHistoricoAtendimento, formatNumeroAtendimento, maxSequenciaAtendimentoNoPayload } from 'iso-pro-shared';
import { carregarMateriaisDoCadastro } from '../../materiais/services/materiais.service';
import type { Material } from '../../materiais/types/material.types';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import { parseLocalStorageRecordArray } from '../../../lib/schemas/localStorageRecordArray.zod';
import type {
  Atendimento,
  AtendimentoDocumento,
  AtendimentoItem,
  AtendimentoRecebedorTipo,
  EstornoAtendimentoLinha,
  EstornoAtendimentoMeta,
  EstornoLogRegistro,
} from '../types/atendimento.types';
import {
  CSV_EXCEL_SEP_ATD,
  montarCsvEstornoLog,
  nomeArquivoExportAtendimentos,
  nomeArquivoExportAtendimentosZip,
  nomeArquivoExportEstornoLog,
  quantidadeEstornadaAcumuladaItem,
  quantidadeRetiradaOriginalItem,
} from '../utils/exportAtendimentosEstornoLog.utils';
import JSZip from 'jszip';

type DocumentoStored = DocumentoPlanejamentoStored;

type MaterialStored = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  saldoAtual?: number;
};

function documentosKeyAtendimento(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-documentos');
}

function materiaisKeyAtendimento(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-materiais');
}

function atendimentosStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-atendimentos');
}

function estornoLogStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-atendimento-estorno-log');
}

function bloqueioLocalChavesAtendimento(param: {
  documentosLength: number;
  materiaisLength: number;
  atendimentosLength: number;
}): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros(
    [
      {
        storageKey: documentosKeyAtendimento(),
        tamanhoNovaLista: param.documentosLength,
        nomeCurto: 'documento(s) de planejamento',
      },
      {
        storageKey: materiaisKeyAtendimento(),
        tamanhoNovaLista: param.materiaisLength,
        nomeCurto: 'material(is) do cadastro',
      },
      {
        storageKey: atendimentosStorageKey(),
        tamanhoNovaLista: param.atendimentosLength,
        nomeCurto: 'atendimento(s)',
      },
    ],
  );
}

type SnapshotPayload = {
  materiais?: Array<{
    id?: string | number;
    codigo?: string;
    descricao?: string;
    unidade?: string;
    saldoAtual?: number | string | null;
  }>;
  documentos?: Array<{
    id?: string | number;
    numero?: string;
    revisao?: string;
    descricao?: string;
    responsavel?: string;
    status?: string;
    itens?: Array<{
      id?: string | number;
      codigo?: string;
      descricao?: string;
      unidade?: string;
      quantidade?: number | string;
      quantidadeAtendida?: number | string;
      /** Alinhado ao snapshot mobile / imports que gravam só snake_case. */
      quantidade_atendida?: number | string;
    }>;
  }>;
  recebimentos?: Array<{
    modoRecebimento?: 'direto' | 'aguardando_conferencia';
    statusConferencia?: 'pendente' | 'conferido' | null;
    itens?: Array<{
      codigo?: string;
      quantidade?: number | string;
      quantidadeConferida?: number | string | null;
    }>;
  }>;
  estoqueAjustes?: Array<{
    codigo?: string;
    delta?: number | string | null;
  }>;
  atendimentoHistorico?: Array<{
    id?: string | number;
    loteNumero?: string;
    data?: string;
    documentoId?: string | number | null;
    documento?: string;
    atendente?: string;
    /** App móvel: matrícula do atendente (PC usa `atendenteMatricula` no objeto agregado). */
    matricula?: string;
    atendenteMatricula?: string;
    atendenteFuncao?: string;
    recebedorMatricula?: string;
    recebedorFuncao?: string;
    recebedorTipo?: AtendimentoRecebedorTipo;
    recebedorColaboradorId?: string | number | null;
    recebedor?: string;
    recebedorEmpresa?: string;
    recebedorDocumento?: string;
    recebedorTelefone?: string;
    autorizadorInterno?: string;
    motivoRetirada?: string;
    codigo?: string;
    descricao?: string;
    unidade?: string;
    quantidade?: number | string;
    origem?: 'mobile' | 'windows';
  }>;
  atendimentos?: Array<{
    id?: string | number;
    numero?: string;
    documentoId?: string | number;
    documentoNumero?: string;
    atendente?: string;
    atendenteMatricula?: string;
    atendenteFuncao?: string;
    recebedorTipo?: AtendimentoRecebedorTipo;
    recebedorColaboradorId?: string | number | null;
    recebedor?: string;
    recebedorMatricula?: string;
    recebedorFuncao?: string;
    recebedorEmpresa?: string;
    recebedorDocumento?: string;
    recebedorTelefone?: string;
    autorizadorInterno?: string;
    motivoRetirada?: string;
    origem?: 'windows' | 'mobile';
    status?: 'concluido' | 'estornado';
    dataAtendimento?: string;
    itens?: Array<{
      id?: string | number;
      documentoItemId?: string | number;
      materialId?: string | number | null;
      codigoMaterial?: string;
      descricaoMaterial?: string;
      unidade?: string;
      quantidadeAtendida?: number | string;
      quantidadeRetiradaOriginal?: number | string;
      documentoNumero?: string;
    }>;
  }>;
  /** Log auditavel de estornos (PC/web). */
  atendimentoEstornoLog?: Array<{
    id?: string;
    dataEstorno?: string;
    loteNumero?: string;
    loteId?: string;
    atendimentoItemId?: string;
    documentoNumero?: string;
    codigoMaterial?: string;
    descricaoMaterial?: string;
    unidade?: string;
    quantidadeEstornada?: number | string;
    quantidadeRetiradaOriginal?: number | string;
    quantidadeRestanteNoLote?: number | string;
    nomeQuemEstorna?: string;
    nomeQuemDevolve?: string;
    motivoEstorno?: string;
    estornoParcialLote?: boolean;
  }>;
};

function readJson<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const rows = parseLocalStorageRecordArray(parsed);
  if (rows === null) return [];
  return rows as T[];
}

function writeJson<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadLocalState() {
  return {
    documentos: readJson<DocumentoStored>(documentosKeyAtendimento()),
    materiais: readJson<MaterialStored>(materiaisKeyAtendimento()),
    atendimentos: readJson<Atendimento>(atendimentosStorageKey()),
    estornoLog: readJson<EstornoLogRegistro>(estornoLogStorageKey()),
  };
}

function mapEstornoLogFromSnapshot(raw: SnapshotPayload['atendimentoEstornoLog']): EstornoLogRegistro[] {
  if (!raw?.length) return [];
  return raw.map((r, index) => ({
    id: String(r.id ?? `est-log-${index}`),
    dataEstorno: String(r.dataEstorno ?? ''),
    loteNumero: String(r.loteNumero ?? ''),
    loteId: String(r.loteId ?? ''),
    atendimentoItemId: String(r.atendimentoItemId ?? ''),
    documentoNumero: String(r.documentoNumero ?? ''),
    codigoMaterial: String(r.codigoMaterial ?? ''),
    descricaoMaterial: String(r.descricaoMaterial ?? ''),
    unidade: String(r.unidade ?? 'UN'),
    quantidadeEstornada: Number(r.quantidadeEstornada ?? 0),
    quantidadeRetiradaOriginal: Number(r.quantidadeRetiradaOriginal ?? 0),
    quantidadeRestanteNoLote: Number(r.quantidadeRestanteNoLote ?? 0),
    nomeQuemEstorna: String(r.nomeQuemEstorna ?? ''),
    nomeQuemDevolve: String(r.nomeQuemDevolve ?? ''),
    motivoEstorno: String(r.motivoEstorno ?? ''),
    estornoParcialLote: Boolean(r.estornoParcialLote),
  }));
}

function estornoLogToSnapshotRecord(entry: EstornoLogRegistro): NonNullable<SnapshotPayload['atendimentoEstornoLog']>[number] {
  return { ...entry };
}

function mergeEstornoLog(local: EstornoLogRegistro[], remote: EstornoLogRegistro[]): EstornoLogRegistro[] {
  const porId = new Map<string, EstornoLogRegistro>();
  for (const entry of local) porId.set(entry.id, entry);
  for (const entry of remote) porId.set(entry.id, entry);
  return Array.from(porId.values()).sort((a, b) => b.dataEstorno.localeCompare(a.dataEstorno));
}

async function carregarEstornoLog(): Promise<EstornoLogRegistro[]> {
  if (hasSupabaseConfig()) {
    try {
      const payload = await readSnapshotPayload();
      return mapEstornoLogFromSnapshot(payload.atendimentoEstornoLog);
    } catch {
      /* fallback local */
    }
  }
  return readJson<EstornoLogRegistro>(estornoLogStorageKey());
}

/** Linhas do log de estorno de um lote (recibo / Total na lista apos estorno total). */
export async function listarEstornoLogDoLote(loteNumero: string): Promise<EstornoLogRegistro[]> {
  const n = String(loteNumero ?? '').trim();
  if (!n) return [];
  const all = await carregarEstornoLog();
  return all.filter((e) => String(e.loteNumero ?? '').trim() === n);
}

function itensFromEstornoLogEntries(
  entries: NonNullable<SnapshotPayload['atendimentoEstornoLog']>,
  loteNumero: string,
): AtendimentoItem[] {
  const n = String(loteNumero ?? '').trim();
  return entries
    .filter((e) => String(e.loteNumero ?? '').trim() === n)
    .map((e, index) => ({
      id: String(e.atendimentoItemId ?? e.id ?? `est-item-${index}`),
      documentoItemId: '',
      materialId: null,
      codigoMaterial: String(e.codigoMaterial ?? ''),
      descricaoMaterial: String(e.descricaoMaterial ?? ''),
      unidade: String(e.unidade ?? 'UN'),
      quantidadeAtendida: Number(e.quantidadeEstornada ?? 0) || 0,
      quantidadeRetiradaOriginal:
        Number(e.quantidadeRetiradaOriginal ?? e.quantidadeEstornada ?? 0) || 0,
      documentoNumero: String(e.documentoNumero ?? ''),
    }));
}

/** Mescla lotes do snapshot remoto (mobile/web) com o cache local do desktop. */
function mergeAtendimentosHistorico(local: Atendimento[], remote: Atendimento[]): Atendimento[] {
  const porNumero = new Map<string, Atendimento>();
  for (const a of local) {
    if (a?.numero) porNumero.set(a.numero, a);
  }
  for (const a of remote) {
    if (a?.numero) porNumero.set(a.numero, a);
  }
  return Array.from(porNumero.values()).sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento));
}

/** Atualiza quantidades atendidas nos desenhos a partir da nuvem (baixas feitas no telemóvel). */
function mergeDocumentosAtendimentoLocal(local: DocumentoStored[], remote: DocumentoStored[]): DocumentoStored[] {
  const porId = new Map(local.map((d) => [String(d.id), d]));
  for (const rem of remote) {
    const id = String(rem.id);
    const prev = porId.get(id);
    if (!prev) {
      porId.set(id, rem);
      continue;
    }
    const itensPorId = new Map(prev.itens.map((it) => [String(it.id), { ...it }]));
    for (const itRem of rem.itens) {
      const key = String(itRem.id);
      const itLoc = itensPorId.get(key);
      if (itLoc) {
        itensPorId.set(key, { ...itLoc, quantidadeAtendida: itRem.quantidadeAtendida });
      } else {
        itensPorId.set(key, itRem);
      }
    }
    const itens = Array.from(itensPorId.values());
    porId.set(id, { ...prev, ...rem, itens, status: deriveDocumentoStatus({ ...prev, itens }) });
  }
  return Array.from(porId.values());
}

let inflightDesktopAtendimentoMerge: Promise<'ok' | 'skip' | 'fail'> | null = null;

async function mesclarAtendimentoDesktopComNuvem(): Promise<'ok' | 'skip' | 'fail'> {
  if (!hasSupabaseConfig() || !isIsoProDesktop()) return 'skip';
  if (inflightDesktopAtendimentoMerge) return inflightDesktopAtendimentoMerge;

  inflightDesktopAtendimentoMerge = (async () => {
    try {
      const remote = await withRemoteReadTimeout(() => readRemoteState());
      const local = loadLocalState();
      const atendimentos = mergeAtendimentosHistorico(local.atendimentos, remote.atendimentos);
      const documentos = mergeDocumentosAtendimentoLocal(local.documentos, remote.documentos);
      const estornoLog = mergeEstornoLog(local.estornoLog, remote.estornoLog ?? []);
      writeJson(atendimentosStorageKey(), atendimentos);
      writeJson(documentosKeyAtendimento(), documentos);
      writeJson(estornoLogStorageKey(), estornoLog);
      if (remote.materiais.length) {
        writeJson(materiaisKeyAtendimento(), remote.materiais);
      }
      return 'ok';
    } catch {
      return 'fail';
    } finally {
      inflightDesktopAtendimentoMerge = null;
    }
  })();

  return inflightDesktopAtendimentoMerge;
}

async function readSnapshotPayload(): Promise<SnapshotPayload> {
  return await readSnapshotRemoteSliceOrFull<SnapshotPayload>(SNAPSHOT_OPERATIONAL_SLICE_KEYS);
}

async function readSnapshotPayloadLight(): Promise<SnapshotPayload> {
  return await readSnapshotRemoteSliceOrFull<SnapshotPayload>(SNAPSHOT_ATENDIMENTO_LIGHT_SLICE_KEYS);
}

/** Recebimento sintetico equivalente ao agregado do servidor — buildSaldoMap soma `quantidade` no modo direto. */
function recebimentosSinteticosDeRecebidoPorCodigo(
  recebidoPorCodigo: Map<string, number>,
): NonNullable<SnapshotPayload['recebimentos']> {
  return [
    {
      modoRecebimento: 'direto',
      itens: [...recebidoPorCodigo.entries()].map(([codigo, quantidade]) => ({ codigo, quantidade })),
    },
  ];
}

/**
 * Fatia leve com o recebido agregado no servidor: evita baixar `recebimentos`
 * (~1 MB em obra grande) so para somar quantidades por codigo. Se a RPC ainda
 * nao existir na nuvem, cai na fatia leve completa (comportamento anterior).
 */
async function readSnapshotPayloadLightComAgregados(): Promise<SnapshotPayload> {
  const recebidoPorCodigo = await fetchQuantidadeRecebidaPorCodigo().catch(() => null);
  if (recebidoPorCodigo == null) {
    return await readSnapshotPayloadLight();
  }
  const parcial = await readSnapshotRemoteSliceOrFull<SnapshotPayload>(
    SNAPSHOT_ATENDIMENTO_LIGHT_SEM_RECEBIMENTOS_SLICE_KEYS,
  );
  return { ...parcial, recebimentos: recebimentosSinteticosDeRecebidoPorCodigo(recebidoPorCodigo) };
}

async function readSnapshotPayloadHistorico(): Promise<SnapshotPayload> {
  return await readSnapshotRemoteSliceOrFull<SnapshotPayload>(SNAPSHOT_ATENDIMENTO_HISTORICO_SLICE_KEYS);
}

/** Histórico de lotes sem documentos[] / materiais — abertura do módulo. */
async function readRemoteHistoricoAtendimentos(): Promise<Atendimento[]> {
  const payload = await readSnapshotPayloadHistorico();
  return mapSnapshotAtendimentos(payload);
}

function documentosSinteticosDeAtendidoPorCodigo(
  atendidoPorCodigo: Map<string, number>,
): NonNullable<SnapshotPayload['documentos']> {
  return [
    {
      id: '__atendido_agg__',
      itens: [...atendidoPorCodigo.entries()].map(([codigo, quantidadeAtendida]) => ({
        codigo,
        quantidade: quantidadeAtendida,
        quantidadeAtendida,
      })),
    },
  ];
}

async function carregarDocumentoStoredDaNuvem(
  documentoId: string,
  numero?: string | null,
): Promise<DocumentoStored | null> {
  const supabase = getSupabase();
  const id = String(documentoId ?? '').trim();
  const num = String(numero ?? '').trim();
  if (!supabase || (!id && !num)) return null;
  const { data, error } = await supabase.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: getActiveTenantId(),
    p_documento_id: id || null,
    p_numero: id ? null : num || null,
    p_revisao: null,
  });
  if (error) return null;
  const row = (data ?? {}) as { documento?: Record<string, unknown>; _error?: string };
  if (row._error || !row.documento) return null;
  const doc = row.documento;
  const itensRaw = Array.isArray(doc.itens) ? doc.itens : [];
  return {
    id: String(doc.id ?? id),
    numero: String(doc.numero ?? num),
    revisao: String(doc.revisao ?? 'A'),
    descricao: String(doc.descricao ?? ''),
    responsavel: String(doc.responsavel ?? ''),
    status: (String(doc.status ?? 'pendente') as DocumentoStored['status']) || 'pendente',
    itens: itensRaw.map((raw, index) => {
      const item = raw as Record<string, unknown>;
      return {
        id: String(item.id ?? `item-${index + 1}`),
        codigoMaterial: String(item.codigo ?? item.codigoMaterial ?? ''),
        descricaoMaterial: String(item.descricao ?? item.descricaoMaterial ?? ''),
        unidade: String(item.unidade ?? 'UN'),
        quantidadeProjeto: Number(item.quantidade ?? item.quantidadeProjeto ?? 0) || 0,
        quantidadeAtendida: Number(item.quantidadeAtendida ?? 0) || 0,
        localizacao: String(item.localizacao ?? ''),
      };
    }),
  };
}

/** Carrega so os desenhos do lote — RPC por numero/id; evita documentos[] completo. */
async function carregarDocumentosParaEstorno(atendimento: Atendimento): Promise<DocumentoStored[]> {
  const nums = numerosDocumentosDistintosItens(atendimento.itens);
  const headerId = String(atendimento.documentoId ?? '').trim();
  const headerNum = String(atendimento.documentoNumero ?? '').trim();
  const docs: DocumentoStored[] = [];
  const seen = new Set<string>();

  const push = (doc: DocumentoStored | null) => {
    if (!doc?.id || seen.has(doc.id)) return;
    seen.add(doc.id);
    docs.push(doc);
  };

  await Promise.all(
    nums.map(async (num) => {
      push(await carregarDocumentoStoredDaNuvem('', num));
    }),
  );

  if (docs.length === 0 && headerId && headerNum.toUpperCase() !== 'MULTIPLOS') {
    push(await carregarDocumentoStoredDaNuvem(headerId));
  }

  if (docs.length > 0) return docs;

  // Fallback (testes / RPC ausente): filtra do payload so os numeros do lote.
  // Timeout curto — em obra grande o caminho principal e o RPC acima.
  try {
    const payload = await withRemoteReadTimeout(() => readSnapshotPayload(), 8_000);
    const wanted = new Set(nums.map((n) => n.toLowerCase()));
    if (headerId) wanted.add(headerId.toLowerCase());
    for (const raw of payload.documentos ?? []) {
      const id = String(raw.id ?? '').trim();
      const numero = String(raw.numero ?? '').trim();
      if (!id) continue;
      if (
        wanted.has(id.toLowerCase()) ||
        wanted.has(numero.toLowerCase()) ||
        (nums.length === 0 && id === headerId)
      ) {
        push({
          id,
          numero,
          revisao: String(raw.revisao ?? 'A'),
          descricao: String(raw.descricao ?? ''),
          responsavel: String(raw.responsavel ?? ''),
          status: (String(raw.status ?? 'pendente') as DocumentoStored['status']) || 'pendente',
          itens: (raw.itens ?? []).map((rawItem, index) => {
            const item = rawItem as Record<string, unknown>;
            return {
              id: String(item.id ?? `${id}-item-${index + 1}`),
              codigoMaterial: String(item.codigo ?? item.codigoMaterial ?? ''),
              descricaoMaterial: String(item.descricao ?? item.descricaoMaterial ?? ''),
              unidade: String(item.unidade ?? 'UN'),
              quantidadeProjeto: Number(item.quantidade ?? item.quantidadeProjeto ?? 0) || 0,
              quantidadeAtendida: Number(item.quantidadeAtendida ?? 0) || 0,
              localizacao: String(item.localizacao ?? ''),
            };
          }),
        });
      }
    }
  } catch {
    /* sem fallback */
  }

  return docs;
}

type SnapshotDocumentoRecord = NonNullable<SnapshotPayload['documentos']>[number];
type SnapshotAtendimentoRecord = NonNullable<SnapshotPayload['atendimentos']>[number];
type SnapshotHistoricoRecord = NonNullable<SnapshotPayload['atendimentoHistorico']>[number];

function documentoStoredToSnapshotRecord(doc: DocumentoStored): SnapshotDocumentoRecord {
  return {
    id: doc.id,
    numero: doc.numero,
    revisao: doc.revisao,
    descricao: doc.descricao,
    responsavel: doc.responsavel,
    status: doc.status,
    itens: doc.itens.map((item) => ({
      id: item.id,
      codigo: item.codigoMaterial,
      descricao: item.descricaoMaterial,
      unidade: item.unidade,
      quantidade: item.quantidadeProjeto,
      quantidadeAtendida: item.quantidadeAtendida,
    })),
  };
}

function atendimentoToSnapshotRecord(atendimento: Atendimento): SnapshotAtendimentoRecord {
  return {
    id: atendimento.id,
    numero: atendimento.numero,
    documentoId: atendimento.documentoId,
    documentoNumero: atendimento.documentoNumero,
    atendente: atendimento.atendente,
    atendenteMatricula: atendimento.atendenteMatricula,
    atendenteFuncao: atendimento.atendenteFuncao,
    recebedorTipo: atendimento.recebedorTipo,
    recebedorColaboradorId: atendimento.recebedorColaboradorId,
    recebedor: atendimento.recebedor,
    recebedorMatricula: atendimento.recebedorMatricula,
    recebedorFuncao: atendimento.recebedorFuncao,
    recebedorEmpresa: atendimento.recebedorEmpresa,
    recebedorDocumento: atendimento.recebedorDocumento,
    recebedorTelefone: atendimento.recebedorTelefone,
    autorizadorInterno: atendimento.autorizadorInterno,
    motivoRetirada: atendimento.motivoRetirada,
    origem: atendimento.origem,
    status: atendimento.status,
    dataAtendimento: atendimento.dataAtendimento,
    itens: atendimento.itens.map((item) => ({
      id: item.id,
      documentoItemId: item.documentoItemId,
      materialId: item.materialId,
      codigoMaterial: item.codigoMaterial,
      descricaoMaterial: item.descricaoMaterial,
      unidade: item.unidade,
      quantidadeAtendida: item.quantidadeAtendida,
      quantidadeRetiradaOriginal: item.quantidadeRetiradaOriginal,
      documentoNumero: item.documentoNumero,
    })),
  };
}

function buildAtendimentoHistoricoFromAtendimentos(atendimentos: Atendimento[]): SnapshotHistoricoRecord[] {
  return atendimentos.flatMap((atendimento) =>
    atendimento.itens.map((item) => ({
      id: item.id,
      loteNumero: atendimento.numero,
      data: atendimento.dataAtendimento,
      documentoId: item.documentoNumero && item.documentoNumero !== atendimento.documentoNumero
        ? ''
        : atendimento.documentoId,
      documento: String(item.documentoNumero?.trim() || atendimento.documentoNumero || '-'),
      atendente: atendimento.atendente,
      atendenteMatricula: atendimento.atendenteMatricula,
      atendenteFuncao: atendimento.atendenteFuncao,
      recebedorTipo: atendimento.recebedorTipo,
      recebedorColaboradorId: atendimento.recebedorColaboradorId,
      recebedor: atendimento.recebedor,
      recebedorMatricula: atendimento.recebedorMatricula,
      recebedorFuncao: atendimento.recebedorFuncao,
      recebedorEmpresa: atendimento.recebedorEmpresa,
      recebedorDocumento: atendimento.recebedorDocumento,
      recebedorTelefone: atendimento.recebedorTelefone,
      autorizadorInterno: atendimento.autorizadorInterno,
      motivoRetirada: atendimento.motivoRetirada,
      codigo: item.codigoMaterial,
      descricao: item.descricaoMaterial,
      unidade: item.unidade,
      quantidade: item.quantidadeAtendida,
      origem: atendimento.origem,
    })),
  );
}

/** Preserva linhas legado/mobile em `atendimentoHistorico` cujo lote ainda nao existe em `atendimentos`. */
export function mergeAtendimentoHistoricoPreservingLegacy(
  existingHistorico: SnapshotHistoricoRecord[],
  atendimentosMerged: Atendimento[],
): SnapshotHistoricoRecord[] {
  const numerosAtendimentos = new Set(atendimentosMerged.map((a) => a.numero));
  const legacyHistorico = existingHistorico.filter((h) => {
    const lote = String(h.loteNumero ?? '').trim();
    return lote && !numerosAtendimentos.has(lote);
  });
  return [...legacyHistorico, ...buildAtendimentoHistoricoFromAtendimentos(atendimentosMerged)];
}

/** Grava documento(s) e atendimento(s) via comando idempotente + patch delta (arquitetura enterprise). */
async function writeSnapshotAtendimentoPatch(patch: {
  documentos?: DocumentoStored[];
  atendimentos?: Atendimento[];
  estornoLogAppend?: EstornoLogRegistro[];
}): Promise<void> {
  await gravarAtendimentoNaNuvemComComando({
    prepare: async () => {
      // Estorno: sem atendimentoHistorico (fatia pesada). Baixa normal continua a ler historico.
      const ehEstornoPrepare = (patch.estornoLogAppend?.length ?? 0) > 0;
      const sliceKeys = ehEstornoPrepare
        ? (['atendimentos', 'atendimentoEstornoLog', 'configuracoesSistema'] as const)
        : (['atendimentos', 'atendimentoHistorico', 'atendimentoEstornoLog', 'configuracoesSistema'] as const);
      // Sem timeout esta leitura pode pendurar a gravacao indefinidamente (modal «A gravar…» sem fim).
      const { slices: currentPayload, baselineUpdatedAt } = await withRemoteReadTimeout(
        () => readIsoProSnapshotSlicesForWrite(sliceKeys),
        REMOTE_READ_TIMEOUT_HEAVY_MS,
      );
      const patchDocumentos = (patch.documentos ?? []).map(documentoStoredToSnapshotRecord);
      const currentAtendimentos = (currentPayload.atendimentos ?? []) as SnapshotAtendimentoRecord[];
      const existingEstornoLog = mapEstornoLogFromSnapshot(
        currentPayload.atendimentoEstornoLog as SnapshotPayload['atendimentoEstornoLog'],
      );

      // Baseline documentos vazio + next = patch → o delta inclui todos os docs do comando.
      // O servidor faz merge por id no snapshot completo (GREATEST na baixa / regressao no estorno).
      const documentos = patchDocumentos;

      const atendimentosSnapshot = patch.atendimentos?.length
        ? mergeSnapshotRowsById(currentAtendimentos, patch.atendimentos.map(atendimentoToSnapshotRecord))
        : currentAtendimentos;

      const atendimentoEstornoLog = patch.estornoLogAppend?.length
        ? [...existingEstornoLog, ...patch.estornoLogAppend].map(estornoLogToSnapshotRecord)
        : (currentPayload.atendimentoEstornoLog ?? existingEstornoLog.map(estornoLogToSnapshotRecord));

      const ehEstorno = (patch.estornoLogAppend?.length ?? 0) > 0;
      const existingHistorico = (currentPayload.atendimentoHistorico ?? []) as SnapshotHistoricoRecord[];
      // Estorno: nao mexer no historico (nao ler/reconstruir). Baixa continua a fundir.
      const atendimentoHistorico = ehEstorno
        ? existingHistorico
        : mergeAtendimentoHistoricoPreservingLegacy(
            existingHistorico,
            mapAtendimentosFromSnapshotArray({
              ...currentPayload,
              atendimentos: atendimentosSnapshot,
            }),
          );

      const nextSlices: SnapshotSlice = {
        documentos,
        atendimentos: atendimentosSnapshot,
        ...(ehEstorno ? {} : { atendimentoHistorico }),
        atendimentoEstornoLog: Array.isArray(atendimentoEstornoLog) ? atendimentoEstornoLog : [],
        configuracoesSistema: currentPayload.configuracoesSistema as Record<string, unknown> | undefined,
        dataAtualizacao: new Date().toISOString(),
      };

      const baselineSlices: SnapshotSlice = {
        documentos: [],
        atendimentos: currentAtendimentos,
        ...(ehEstorno ? {} : { atendimentoHistorico: existingHistorico }),
        atendimentoEstornoLog: Array.isArray(currentPayload.atendimentoEstornoLog)
          ? (currentPayload.atendimentoEstornoLog as unknown[])
          : existingEstornoLog.map(estornoLogToSnapshotRecord),
        configuracoesSistema: currentPayload.configuracoesSistema as Record<string, unknown> | undefined,
        dataAtualizacao: currentPayload.dataAtualizacao as string | undefined,
      };

      const idempotencyKey = buildDesktopAtendimentoIdempotencyKey({
        atendimentos: patch.atendimentos?.map((a) => ({ id: a.id, numero: a.numero })),
        estornoLogIds: patch.estornoLogAppend?.map((e) => e.id),
      });

      return {
        baseline: {
          slices: baselineSlices,
          baselineUpdatedAt,
        },
        next: {
          slices: nextSlices,
          baselineUpdatedAt,
        },
        idempotencyKey,
      };
    },
  });
  invalidateSaldoOperacionalCache();
  registrarAtividadeBackupOracle('atendimento');
}

function buildLocalPayloadParaReconciliacao(
  local: ReturnType<typeof loadLocalState>,
  recebimentos: Recebimento[],
): SnapshotPayload {
  return {
    materiais: local.materiais.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      saldoAtual: m.saldoAtual,
    })),
    documentos: local.documentos.map((doc) => ({
      id: doc.id,
      numero: doc.numero,
      revisao: doc.revisao,
      descricao: doc.descricao,
      responsavel: doc.responsavel,
      status: doc.status,
      itens: doc.itens.map((i) => ({
        id: i.id,
        codigo: i.codigoMaterial,
        descricao: i.descricaoMaterial,
        unidade: i.unidade,
        quantidade: i.quantidadeProjeto,
        quantidadeAtendida: i.quantidadeAtendida,
      })),
    })),
    recebimentos: recebimentos.filter((r) => r.status !== 'cancelado').map(recebimentoParaSnapshotSaldo),
    atendimentos: local.atendimentos as SnapshotPayload['atendimentos'],
  };
}

function recebimentoParaSnapshotSaldo(rec: Recebimento): NonNullable<SnapshotPayload['recebimentos']>[number] {
  return {
    modoRecebimento: rec.modoRecebimento,
    statusConferencia:
      rec.modoRecebimento === 'aguardando_conferencia'
        ? rec.status === 'conferido'
          ? 'conferido'
          : 'pendente'
        : null,
    itens: rec.itens.map((i) => ({
      codigo: i.codigoMaterial,
      quantidade: i.quantidadeRecebida,
      quantidadeConferida: i.quantidadeConferida,
    })),
  };
}

/** Modo local: saldo do JSON de materiais nao inclui recebimentos; recalcula como no snapshot nuvem. */
async function enrichMateriaisSaldoFromLocalMovement(
  materiais: MaterialStored[],
  documentos: DocumentoStored[],
): Promise<MaterialStored[]> {
  const recebimentos = await carregarRecebimentosCompletos();
  const payload: SnapshotPayload = {
    materiais: materiais.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      saldoAtual: m.saldoAtual,
    })),
    documentos: documentos.map((doc) => ({
      id: doc.id,
      itens: (doc.itens ?? []).map((i) => ({
        codigo: i.codigoMaterial,
        quantidade: i.quantidadeProjeto,
        quantidadeAtendida: i.quantidadeAtendida,
      })),
    })),
    recebimentos: recebimentos.filter((r) => r.status !== 'cancelado').map(recebimentoParaSnapshotSaldo),
  };
  const saldoMap = buildSaldoMap(payload);
  return materiais.map((m) => ({
    ...m,
    saldoAtual: saldoMap.get(codigoMaterialKey(m.codigo)) ?? 0,
  }));
}

/**
 * Cache curto do saldo operacional: cada bipe do leitor precisava baixar ~1,3 MB de fatias.
 * Validacao final de saldo acontece na gravacao; aqui o saldo orienta a UI do leitor/busca.
 */
let saldoOperacionalCache: { map: Map<string, number>; at: number } | null = null;
const SALDO_OPERACIONAL_CACHE_TTL_MS = 45_000;

export function invalidateSaldoOperacionalCache(): void {
  saldoOperacionalCache = null;
}

/** Saldo recebimentos − já atendido (+ ajustes), igual ao mobile e à lista de Materiais após recálculo. */
async function obterSaldoMapOperacional(): Promise<Map<string, number>> {
  if (shouldTryRemoteRead()) {
    if (saldoOperacionalCache && Date.now() - saldoOperacionalCache.at <= SALDO_OPERACIONAL_CACHE_TTL_MS) {
      return new Map(saldoOperacionalCache.map);
    }
    try {
      const [recebidoPorCodigo, atendidoPorCodigo] = await Promise.all([
        fetchQuantidadeRecebidaPorCodigo().catch(() => null),
        fetchQuantidadeAtendidaPorCodigo().catch(() => new Map<string, number>()),
      ]);
      let saldoMap: Map<string, number>;
      if (recebidoPorCodigo != null) {
        // Agregados do servidor: so materiais + ajustes (~KB) em vez de recebimentos (~1 MB).
        const parcial = await withRemoteReadTimeout(() =>
          readSnapshotRemoteSliceOrFull<SnapshotPayload>(SNAPSHOT_SALDO_AGREGADOS_SLICE_KEYS),
        );
        saldoMap = buildSaldoMap({
          ...parcial,
          recebimentos: recebimentosSinteticosDeRecebidoPorCodigo(recebidoPorCodigo),
          documentos: documentosSinteticosDeAtendidoPorCodigo(atendidoPorCodigo),
        } satisfies SnapshotPayload);
      } else {
        const payloadLight = await withRemoteReadTimeout(() => readSnapshotPayloadLight());
        saldoMap =
          atendidoPorCodigo.size > 0
            ? buildSaldoMap({
                ...payloadLight,
                documentos: documentosSinteticosDeAtendidoPorCodigo(atendidoPorCodigo),
              } satisfies SnapshotPayload)
            : // Nunca cair no snapshot completo com documentos[] (timeout ~20s no boot).
              buildSaldoMap(payloadLight);
      }
      saldoOperacionalCache = { map: new Map(saldoMap), at: Date.now() };
      return saldoMap;
    } catch {
      return new Map();
    }
  }
  const local = loadLocalState();
  const recebimentos = await carregarRecebimentosCompletos();
  const payload = buildLocalPayloadParaReconciliacao(local, recebimentos);
  const documentosRec = documentosReconciliadosDoPayload(payload);
  return buildSaldoMap(montarSaldoPayloadComDocumentosReconciliados(payload, documentosRec));
}

function mapSnapshotMateriais(payload: SnapshotPayload, saldoMapParam?: Map<string, number>): MaterialStored[] {
  const saldoMap = saldoMapParam ?? buildSaldoMap(payload);
  return (payload.materiais ?? []).map((material, index) => {
    const codigo = String(material.codigo ?? '').trim();
    return {
      id: String(material.id ?? `mat-${index + 1}`),
      codigo,
      descricao: String(material.descricao ?? ''),
      unidade: String(material.unidade ?? 'UN'),
      saldoAtual: saldoMap.get(codigoMaterialKey(codigo)) ?? 0,
    };
  });
}

/**
 * Com materiais na tabela Supabase, o cadastro pode existir fora do array `payload.materiais` do snapshot.
 * Cruza o cadastro com o saldo calculado para o atendimento enxergar os mesmos codigos que a lista de Materiais.
 */
function mergeMateriaisSnapshotComCadastroNuvem(
  snapshotMats: MaterialStored[],
  cadastro: Material[],
  saldoMap: Map<string, number>,
): MaterialStored[] {
  const porCodigo = new Map<string, MaterialStored>();
  for (const m of snapshotMats) {
    porCodigo.set(codigoMaterialKey(m.codigo), m);
  }
  for (const c of cadastro) {
    const key = codigoMaterialKey(c.codigo);
    if (!key) continue;
    const saldo = saldoMap.get(key) ?? 0;
    porCodigo.set(key, {
      id: String(c.id),
      codigo: c.codigo,
      descricao: c.descricao,
      unidade: c.unidade,
      saldoAtual: saldo,
    });
  }
  return Array.from(porCodigo.values());
}

function mapAtendimentosFromSnapshotArray(payload: SnapshotPayload): Atendimento[] {
  if (!payload.atendimentos?.length) return [];
  const mapped: Atendimento[] = payload.atendimentos.map((atendimento, index) => ({
    id: String(atendimento.id ?? `atd-${index + 1}`),
    numero: String(atendimento.numero ?? buildNumeroAtendimento(index + 1)),
    documentoId: String(atendimento.documentoId ?? ''),
    documentoNumero: String(atendimento.documentoNumero ?? '-'),
    atendente: String(atendimento.atendente ?? ''),
    atendenteMatricula: String(atendimento.atendenteMatricula ?? ''),
    atendenteFuncao: String(atendimento.atendenteFuncao ?? ''),
    recebedorTipo: atendimento.recebedorTipo === 'externo' ? 'externo' : 'interno',
    recebedorColaboradorId: atendimento.recebedorColaboradorId != null ? String(atendimento.recebedorColaboradorId) : null,
    recebedor: String(atendimento.recebedor ?? ''),
    recebedorMatricula: String(atendimento.recebedorMatricula ?? ''),
    recebedorFuncao: String(atendimento.recebedorFuncao ?? ''),
    recebedorEmpresa: String(atendimento.recebedorEmpresa ?? ''),
    recebedorDocumento: String(atendimento.recebedorDocumento ?? ''),
    recebedorTelefone: String(atendimento.recebedorTelefone ?? ''),
    autorizadorInterno: String(atendimento.autorizadorInterno ?? ''),
    motivoRetirada: String(atendimento.motivoRetirada ?? ''),
    origem: atendimento.origem === 'mobile' ? 'mobile' : 'windows',
    status: atendimento.status === 'estornado' ? 'estornado' : 'concluido',
    dataAtendimento: String(atendimento.dataAtendimento ?? new Date().toISOString()),
    itens: (atendimento.itens ?? []).map((item, itemIndex) => ({
      id: String(item.id ?? `${atendimento.id ?? index}-item-${itemIndex + 1}`),
      documentoItemId: String(item.documentoItemId ?? ''),
      materialId: item.materialId != null ? String(item.materialId) : null,
      codigoMaterial: String(item.codigoMaterial ?? ''),
      descricaoMaterial: String(item.descricaoMaterial ?? ''),
      unidade: String(item.unidade ?? 'UN'),
      quantidadeAtendida: Number(item.quantidadeAtendida ?? 0),
      quantidadeRetiradaOriginal:
        item.quantidadeRetiradaOriginal != null ? Number(item.quantidadeRetiradaOriginal) : undefined,
      documentoNumero: String(
        (item as { documentoNumero?: string }).documentoNumero?.trim() || atendimento.documentoNumero || '',
      ),
    })),
  }));
  for (const at of mapped) {
    normalizarCabecalhoDocumentoAtendimentoAgrupado(at);
  }
  return mapped;
}

/** Copia matrícula/função das linhas planas do histórico (mobile grava `matricula` no atendente). */
function mergeIdentificacaoHistoricoLinha(
  current: Atendimento,
  raw: NonNullable<SnapshotPayload['atendimentoHistorico']>[number],
) {
  const r = raw as Record<string, unknown>;
  const matAt = String(raw.matricula ?? raw.atendenteMatricula ?? r.atendente_matricula ?? '').trim();
  if (matAt && matAt !== '-') {
    if (!String(current.atendenteMatricula ?? '').trim()) current.atendenteMatricula = matAt;
  }
  const funAt = String(raw.atendenteFuncao ?? r.atendente_funcao ?? '').trim();
  if (funAt && funAt !== '—') {
    if (!String(current.atendenteFuncao ?? '').trim()) current.atendenteFuncao = funAt;
  }
  const matRec = String(raw.recebedorMatricula ?? r.recebedor_matricula ?? '').trim();
  if (matRec && matRec !== '-') {
    if (!String(current.recebedorMatricula ?? '').trim()) current.recebedorMatricula = matRec;
  }
  const funRec = String(raw.recebedorFuncao ?? r.recebedor_funcao ?? '').trim();
  if (funRec && funRec !== '—') {
    if (!String(current.recebedorFuncao ?? '').trim()) current.recebedorFuncao = funRec;
  }
}

/** Ajusta cabecalho quando um lote mobile agrupa itens de varios desenhos. */
export function normalizarCabecalhoDocumentoAtendimentoAgrupado(at: Atendimento): void {
  const nums = new Set(
    at.itens.map((it) => String(it.documentoNumero ?? '').trim()).filter((n) => n && n !== '-'),
  );
  if (nums.size > 1) {
    at.documentoNumero = 'MULTIPLOS';
    at.documentoId = '';
  } else if (nums.size === 1) {
    const unico = [...nums][0]!;
    if (at.documentoNumero !== unico) {
      at.documentoNumero = unico;
    }
  }
}

/** Agrupa linhas planas do historico (formato mobile / legado) por `loteNumero` + `loteId`. */
function mapAtendimentosFromHistoricoGrouped(payload: SnapshotPayload): Atendimento[] {
  const grouped = new Map<string, Atendimento>();
  for (const raw of payload.atendimentoHistorico ?? []) {
    const numero = String(raw.loteNumero ?? '');
    if (!numero) continue;
    const groupKey = chaveAgrupamentoHistoricoAtendimento({
      loteNumero: numero,
      loteId: (raw as Record<string, unknown>).loteId as string | number | null | undefined,
    });
    if (!groupKey) continue;
    const current =
      grouped.get(groupKey) ??
      {
        id: groupKey,
        numero,
        documentoId: String(raw.documentoId ?? ''),
        documentoNumero: String(raw.documento ?? '-'),
        atendente: String(raw.atendente ?? ''),
        atendenteMatricula: '',
        atendenteFuncao: '',
        recebedorTipo: raw.recebedorTipo === 'externo' ? 'externo' : 'interno',
        recebedorColaboradorId: raw.recebedorColaboradorId != null ? String(raw.recebedorColaboradorId) : null,
        recebedor: String(raw.recebedor ?? ''),
        recebedorMatricula: '',
        recebedorFuncao: '',
        recebedorEmpresa: String(raw.recebedorEmpresa ?? ''),
        recebedorDocumento: String(raw.recebedorDocumento ?? ''),
        recebedorTelefone: String(raw.recebedorTelefone ?? ''),
        autorizadorInterno: String(raw.autorizadorInterno ?? ''),
        motivoRetirada: String(raw.motivoRetirada ?? ''),
        origem: raw.origem === 'mobile' ? ('mobile' as const) : ('windows' as const),
        status: 'concluido' as const,
        dataAtendimento: String(raw.data ?? new Date().toISOString()),
        itens: [],
      };

    if (raw.origem === 'mobile') {
      current.origem = 'mobile';
    }

    mergeIdentificacaoHistoricoLinha(current, raw);

    current.itens.push({
      id: String(raw.id ?? crypto.randomUUID()),
      documentoItemId: String((raw as Record<string, unknown>).documentoItemId ?? ''),
      materialId: null,
      codigoMaterial: String(raw.codigo ?? ''),
      descricaoMaterial: String(raw.descricao ?? ''),
      unidade: String(raw.unidade ?? 'UN'),
      quantidadeAtendida: Number(raw.quantidade ?? 0),
      documentoNumero: String(raw.documento ?? ''),
    });

    grouped.set(groupKey, current);
  }

  const result = Array.from(grouped.values());
  for (const at of result) {
    normalizarCabecalhoDocumentoAtendimentoAgrupado(at);
  }
  return result;
}

function contarDocumentosDistintosItens(at: Atendimento): number {
  return new Set(
    at.itens.map((it) => String(it.documentoNumero ?? '').trim()).filter((n) => n && n !== '-'),
  ).size;
}

/** Quando o mesmo lote existe em `atendimentos` e `atendimentoHistorico`, prefere o historico se tiver documentos por item mais fieis (mobile). */
function devePreferirHistoricoAgrupado(
  fromArray: Atendimento,
  fromHistorico: Atendimento,
  lotesComEstorno: Set<string>,
): boolean {
  // Lote estornado (total ou parcial): o array e a verdade. As linhas antigas do historico ficam
  // na nuvem (RPC append-only) e "ressuscitavam" o lote como concluido com os itens pre-estorno.
  if (fromArray.status === 'estornado' || lotesComEstorno.has(String(fromArray.numero ?? '').trim())) {
    return false;
  }
  if (fromHistorico.itens.length > fromArray.itens.length) return true;
  const docsHist = contarDocumentosDistintosItens(fromHistorico);
  const docsArr = contarDocumentosDistintosItens(fromArray);
  if (docsHist > docsArr) return true;
  if (fromHistorico.origem === 'mobile' && docsHist > 1 && docsArr <= 1) return true;
  if (fromHistorico.origem === 'mobile' && fromHistorico.itens.length >= fromArray.itens.length && docsHist >= docsArr) {
    return true;
  }
  return false;
}

/** Chave unificada para fundir `atendimentos[]` (PC) com `atendimentoHistorico[]` (mobile). */
function chaveListaAtendimentoUnificada(a: Atendimento): string {
  const numero = String(a.numero ?? '').trim();
  const idStr = String(a.id ?? '').trim();
  let loteId: string | number | null | undefined;
  const sep = `${numero}::`;
  if (numero && idStr.startsWith(sep)) {
    loteId = idStr.slice(sep.length);
  }
  return chaveAgrupamentoHistoricoAtendimento({ loteNumero: numero, loteId }) || idStr || numero;
}

/**
 * O app movel grava atendimentos em `atendimentoHistorico` (linhas por material).
 * O PC grava tambem o array `atendimentos` (lotes agregados). Se existir `atendimentos`,
 * a listagem antiga ignorava o historico — lotes criados so no telefone sumiam na lista do PC.
 */
function mapSnapshotAtendimentos(payload: SnapshotPayload): Atendimento[] {
  const porChave = new Map<string, Atendimento>();
  const estornoLog = payload.atendimentoEstornoLog ?? [];
  const lotesComEstorno = new Set(
    estornoLog.map((e) => String(e.loteNumero ?? '').trim()).filter(Boolean),
  );
  for (const a of mapAtendimentosFromSnapshotArray(payload)) {
    porChave.set(chaveListaAtendimentoUnificada(a), a);
  }
  for (const a of mapAtendimentosFromHistoricoGrouped(payload)) {
    const key = chaveListaAtendimentoUnificada(a);
    const existing = porChave.get(key);
    if (!existing) {
      porChave.set(key, a);
    } else if (devePreferirHistoricoAgrupado(existing, a, lotesComEstorno)) {
      porChave.set(key, a);
    }
  }
  // Estorno total limpa itens[]; o log guarda o que foi devolvido — restaura so para lista/recibo.
  for (const a of porChave.values()) {
    if (a.itens.length > 0) continue;
    if (a.status !== 'estornado' && !lotesComEstorno.has(String(a.numero ?? '').trim())) continue;
    const fromLog = itensFromEstornoLogEntries(estornoLog, a.numero);
    if (fromLog.length) a.itens = fromLog;
  }
  return Array.from(porChave.values()).sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento));
}

async function readRemoteState() {
  const payload = await readSnapshotPayload();
  const documentosRec = documentosReconciliadosDoPayload(payload);
  const saldoMap = buildSaldoMap(montarSaldoPayloadComDocumentosReconciliados(payload, documentosRec));
  let materiais = mapSnapshotMateriais(payload, saldoMap);
  if (shouldUseCloudMaterials()) {
    try {
      const cadastro = await carregarMateriaisDoCadastro();
      materiais = mergeMateriaisSnapshotComCadastroNuvem(materiais, cadastro, saldoMap);
    } catch {
      /* mantem so o snapshot */
    }
  }
  return {
    payload,
    documentos: documentosRec,
    materiais,
    atendimentos: mapSnapshotAtendimentos(payload),
    estornoLog: mapEstornoLogFromSnapshot(payload.atendimentoEstornoLog),
  };
}

/**
 * Leitura operacional sem documentos[] completo — carrega só os IDs pedidos nas tabelas.
 * Nunca cai no snapshot completo (4k+ documentos): em obra grande isso levava 30-60s e a
 * gravacao da sessao parecia «congelada» ate falhar por timeout. Falha aqui = caller decide
 * (registrar* usa `.catch(() => null)` e segue com o estado local).
 */
async function readRemoteStateForWrite(documentoIds: string[]) {
  const uniqueIds = [...new Set(documentoIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const [payloadLight, atendidoPorCodigo] = await withRemoteReadTimeout(
    () =>
      Promise.all([
        readSnapshotPayloadLightComAgregados(),
        fetchQuantidadeAtendidaPorCodigo().catch(() => new Map<string, number>()),
      ]),
    REMOTE_READ_TIMEOUT_HEAVY_MS,
  );
  const saldoMap =
    atendidoPorCodigo.size > 0
      ? buildSaldoMap({
          ...payloadLight,
          documentos: documentosSinteticosDeAtendidoPorCodigo(atendidoPorCodigo),
        })
      : buildSaldoMap(payloadLight);
  let materiais = mapSnapshotMateriais(payloadLight, saldoMap);
  if (shouldUseCloudMaterials()) {
    try {
      const cadastro = await carregarMateriaisDoCadastro();
      materiais = mergeMateriaisSnapshotComCadastroNuvem(materiais, cadastro, saldoMap);
    } catch {
      /* mantem snapshot */
    }
  }
  // Em paralelo, com uma repeticao por documento (RPC leve ~2KB cada).
  const docsLidos = await Promise.all(
    uniqueIds.map(async (id) => (await carregarDocumentoStoredDaNuvem(id)) ?? (await carregarDocumentoStoredDaNuvem(id))),
  );
  const documentos = docsLidos.filter((doc): doc is DocumentoStored => doc != null);
  return {
    payload: payloadLight,
    documentos,
    materiais,
    atendimentos: mapSnapshotAtendimentos(payloadLight),
    estornoLog: mapEstornoLogFromSnapshot(payloadLight.atendimentoEstornoLog),
  };
}

function mesclarDocumentosLocaisComRemotos(
  localDocs: DocumentoStored[],
  remoteDocs: DocumentoStored[],
): DocumentoStored[] {
  if (!remoteDocs.length) return [...localDocs];
  const out = [...localDocs];
  for (const remote of remoteDocs) {
    const idx = out.findIndex((d) => d.id === remote.id);
    if (idx >= 0) out[idx] = remote;
    else out.push(remote);
  }
  return out;
}

function deriveDocumentoStatus(doc: DocumentoStored): DocumentoStored['status'] {
  const total = doc.itens.length;
  let atendidos = 0;
  let pendentes = 0;

  for (const item of doc.itens) {
    if (item.quantidadeAtendida >= item.quantidadeProjeto) {
      atendidos += 1;
    }
    if (item.quantidadeAtendida <= 0) {
      pendentes += 1;
    }
  }

  if (!total || pendentes === total) return 'pendente';
  if (atendidos === total) return 'atendido';
  return 'parcial';
}

/** Saldo de atendimento por linha = max(0, qtd projeto - qtd ja atendida). Mesma regra de listarDocumentosPendentes. */
function documentoSemSaldoParaAtendimento(doc: DocumentoStored): boolean {
  if (!doc.itens.length) return true;
  return doc.itens.every((item) => {
    const proj = Math.max(0, Number(item.quantidadeProjeto) || 0);
    const atd = Math.max(0, Number(item.quantidadeAtendida) || 0);
    return proj <= atd;
  });
}

function buildNumeroAtendimento(index: number) {
  return formatNumeroAtendimento(index);
}

function consumirSequenciaComSnapshot(payload: SnapshotPayload | null | undefined): number {
  const maxSnapshot = payload ? maxSequenciaAtendimentoNoPayload(payload as import('iso-pro-shared').IsoSnapshotPayload) : 0;
  return consumirSequenciaAtendimento(maxSnapshot);
}

function validateRequestedItems(items: Array<{ documentoItemId: string; quantidade: number }>) {
  const positiveItems = items.filter((item) => item.quantidade > 0);
  if (!positiveItems.length) {
    return { valid: false, error: 'Informe ao menos um item com quantidade valida para atendimento.' };
  }

  const seenDocumentoItemIds = new Set<string>();
  for (const item of positiveItems) {
    if (!item.documentoItemId.trim()) {
      return { valid: false, error: 'Existe item de atendimento sem referencia valida ao item do documento.' };
    }

    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      return { valid: false, error: 'As quantidades informadas no atendimento precisam ser numericas e maiores que zero.' };
    }

    if (seenDocumentoItemIds.has(item.documentoItemId)) {
      return { valid: false, error: 'Nao e permitido repetir o mesmo item do documento na mesma operacao de atendimento.' };
    }

    seenDocumentoItemIds.add(item.documentoItemId);
  }

  return { valid: true, items: positiveItems };
}

function mapDocumentosPendentesWire(
  docs: Awaited<ReturnType<typeof listDocumentosPendentesAtendimentoFromCloud>>['documentos'],
  saldoMap: Map<string, number>,
): AtendimentoDocumento[] {
  return docs
    .map((doc) => {
      const statusRaw = String(doc.status ?? 'pendente');
      const status = (
        statusRaw === 'parcial' || statusRaw === 'atendido' || statusRaw === 'cancelado' || statusRaw === 'recebido'
          ? statusRaw
          : 'pendente'
      ) as AtendimentoDocumento['status'];
      return {
        id: String(doc.id ?? ''),
        numero: String(doc.numero ?? ''),
        revisao: String(doc.revisao ?? 'A'),
        descricao: String(doc.descricao ?? ''),
        responsavel: String(doc.responsavel ?? ''),
        status,
        linhas: (doc.itens ?? [])
          .map((item) => {
            const codigo = String(item.codigo ?? '');
            const key = codigoMaterialKey(codigo);
            const quantidadeProjeto = Number(item.quantidade ?? 0) || 0;
            const quantidadeAtendida = Number(item.quantidadeAtendida ?? 0) || 0;
            const pendente = Math.max(0, quantidadeProjeto - quantidadeAtendida);
            return {
              documentoItemId: String(item.id ?? ''),
              materialId: null as string | null,
              codigoMaterial: codigo,
              descricaoMaterial: String(item.descricao ?? ''),
              unidade: String(item.unidade ?? 'UN'),
              quantidadeProjeto,
              quantidadeAtendida,
              quantidadePendente: pendente,
              saldoDisponivel: saldoMap.get(key) ?? 0,
              quantidadeNestaOperacao: 0,
            };
          })
          .filter((item) => item.quantidadePendente > 0),
      };
    })
    .filter((doc) => doc.id && doc.linhas.length > 0)
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

export async function listarDocumentosPendentes(): Promise<AtendimentoDocumento[]> {
  if (shouldTryRemoteRead()) {
    try {
      const cloud = await withRemoteReadTimeout(() =>
        listDocumentosPendentesAtendimentoFromCloud({ limit: 150 }),
      );
      if (cloud.source === 'tables' && !cloud.error) {
        // Boot leve: saldo operacional sem baixar cadastro completo (2k+ materiais).
        const saldoMap = await obterSaldoMapOperacional();
        return mapDocumentosPendentesWire(cloud.documentos, saldoMap);
      }
    } catch {
      /* ignore — sem fallback pesado */
    }
  }

  return [];
}

/**
 * Busca paginada na nuvem para o campo Documento do Atendimento. O boot carrega só os
 * primeiros 150 pendentes (de milhares); ao digitar, esta busca traz o resto por numero,
 * descricao ou revisao. Aceita a linha completa colada ("NUMERO Rev. X - desc").
 */
export async function buscarDocumentosPendentesNuvem(busca: string): Promise<AtendimentoDocumento[]> {
  const q = busca.split(/\s+Rev\.\s/i)[0]?.trim() ?? '';
  if (!q || !shouldTryRemoteRead()) return [];
  try {
    const cloud = await withRemoteReadTimeout(() =>
      listDocumentosPendentesAtendimentoFromCloud({ busca: q, limit: 60 }),
    );
    if (cloud.source === 'tables' && !cloud.error) {
      const saldoMap = await obterSaldoMapOperacional();
      return mapDocumentosPendentesWire(cloud.documentos, saldoMap);
    }
  } catch {
    /* busca é auxiliar — sem erro visível */
  }
  return [];
}

/**
 * Documentos pendentes que contêm o codigo bipado no leitor. Leitura directa das
 * tabelas (nao depende do boot de 150 pendentes nem do p_busca da RPC).
 */
export async function buscarDocumentosPendentesPorCodigoMaterialNuvem(
  codigoMaterial: string,
): Promise<AtendimentoDocumento[]> {
  const codigo = codigoMaterial.trim();
  if (!codigo || !shouldTryRemoteRead()) return [];
  try {
    const cloud = await withRemoteReadTimeout(() =>
      listDocumentosPendentesPorCodigoMaterialFromCloud(codigo),
    );
    if (!cloud.error && cloud.documentos.length > 0) {
      const saldoMap = await obterSaldoMapOperacional();
      return mapDocumentosPendentesWire(cloud.documentos, saldoMap);
    }
  } catch {
    /* busca é auxiliar — sem erro visível */
  }
  return [];
}

export async function listarDocumentosPendentesComMeta(): Promise<ServiceResult<AtendimentoDocumento[]>> {
  let source: 'supabase' | 'local' = 'local';
  const fallbackReason = '';

  try {
    const data = await listarDocumentosPendentes();
    if (shouldTryRemoteRead()) source = 'supabase';
    return {
      success: true,
      data,
      meta: {
        source,
        fallbackReason: fallbackReason || undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: traduzirErroOperacionalIsoPro(
        error instanceof Error ? error.message : 'Falha ao consultar documentos pendentes.',
      ),
    };
  }
}

export async function listarHistoricoAtendimentos(): Promise<Atendimento[]> {
  if (shouldTryRemoteRead()) {
    const items = await readRemoteOrLocal({
      readRemote: () => readRemoteHistoricoAtendimentos(),
      readLocal: () => readJson<Atendimento>(atendimentosStorageKey()),
    });
    return [...items].sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento));
  }
  await mesclarAtendimentoDesktopComNuvem();
  const items = readJson<Atendimento>(atendimentosStorageKey());
  return [...items].sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento));
}

/** Resumo para bloquear exclusao definitiva de documentos que ainda tem historico de atendimento. */
export type DocumentoBloqueadoPorAtendimento = {
  documentoId: string;
  rotulo: string;
  atendimentosCount: number;
  exemplosLotes: string[];
};

/**
 * Entre os documentos candidatos a exclusao, retorna os que possuem ao menos um lote no historico de atendimento
 * (concluido ou estornado). Usado antes de apagar documentos do planejamento.
 */
export async function listarDocumentosComAtendimentoVinculado(
  candidatos: Array<{ id: string; numero: string; revisao: string }>,
): Promise<DocumentoBloqueadoPorAtendimento[]> {
  const idSet = new Set(candidatos.map((c) => c.id).filter(Boolean));
  if (!idSet.size) return [];

  const atendimentos = await listarHistoricoAtendimentos();
  const porDoc = new Map<string, { count: number; lotes: string[] }>();
  const docMeta = new Map(candidatos.map((c) => [c.id, c]));
  const numeroParaId = new Map(
    candidatos.filter((c) => c.id && c.numero).map((c) => [String(c.numero).trim().toLowerCase(), c.id]),
  );

  for (const at of atendimentos) {
    const idsVinculados = new Set<string>();
    if (at.documentoId && idSet.has(at.documentoId)) {
      idsVinculados.add(at.documentoId);
    }
    for (const it of at.itens) {
      const num = String(it.documentoNumero ?? '').trim().toLowerCase();
      if (num && num !== 'multiplos' && num !== '-') {
        const docId = numeroParaId.get(num);
        if (docId && idSet.has(docId)) idsVinculados.add(docId);
      }
    }
    for (const docId of idsVinculados) {
      const cur = porDoc.get(docId) ?? { count: 0, lotes: [] };
      cur.count += 1;
      if (cur.lotes.length < 10) cur.lotes.push(at.numero);
      porDoc.set(docId, cur);
    }
  }

  const out: DocumentoBloqueadoPorAtendimento[] = [];
  for (const [docId, agg] of porDoc) {
    const meta = docMeta.get(docId);
    const rotulo = meta ? `${meta.numero} Rev. ${meta.revisao}` : docId;
    out.push({
      documentoId: docId,
      rotulo,
      atendimentosCount: agg.count,
      exemplosLotes: agg.lotes,
    });
  }
  return out.sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

function rotuloOrigemAtendimento(origem: Atendimento['origem'] | undefined): string {
  if (origem === 'mobile') return 'Mobile';
  return 'PC (Windows)';
}

async function carregarAtendimentosEDocumentosParaExport(): Promise<{
  atendimentos: Atendimento[];
  documentos: DocumentoStored[];
}> {
  if (hasSupabaseConfig()) {
    try {
      const state = await readRemoteState();
      return {
        atendimentos: [...state.atendimentos].sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento)),
        documentos: state.documentos,
      };
    } catch {
      /* fallback local */
    }
  }
  const local = loadLocalState();
  return {
    atendimentos: [...local.atendimentos].sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento)),
    documentos: local.documentos,
  };
}

/** Linha quando o lote nao tem mais itens (ex.: estorno total): o lote continua visivel no Excel. */
function linhaCsvLoteSemItens(
  at: Atendimento,
  docRev: string,
  docDesc: string,
  docResp: string,
): string[] {
  const msg =
    at.status === 'estornado'
      ? 'Lote totalmente estornado — sem material no lote'
      : 'Lote sem linhas de material (verificar dados)';
  return [
    at.numero,
    at.id,
    at.dataAtendimento,
    at.status,
    'nao',
    'nao',
    '0',
    'nao',
    at.documentoNumero,
    docRev,
    docDesc,
    docResp,
    at.atendente,
    at.recebedorColaboradorId ?? '',
    at.recebedorTipo,
    at.recebedor,
    at.recebedorEmpresa,
    at.recebedorDocumento,
    at.recebedorTelefone,
    at.autorizadorInterno,
    at.motivoRetirada,
    rotuloOrigemAtendimento(at.origem),
    '',
    '',
    '(lote)',
    msg,
    '',
    '0',
    '0',
    '0',
  ];
}

/**
 * CSV (Excel PT) uma linha por material atendido, com dados do lote e do documento.
 * Inclui `estorno_permitido` (sim/nao) e `qtd_pode_estornar` (numero) para ver de imediato no Excel se ainda da para estornar e quanto.
 * Lotes com estorno total (`itens` vazios) geram uma linha resumo para nao sumirem do relatorio.
 */
export async function montarExportacaoAtendimentosCsvItens(): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const { atendimentos, documentos } = await carregarAtendimentosEDocumentosParaExport();
  const docMap = new Map(documentos.map((d) => [d.id, d]));

  const header = [
    'lote_numero',
    'lote_id',
    'data_atendimento',
    'status_lote',
    'atendido',
    'estorno_permitido',
    'qtd_pode_estornar',
    'pode_estornar_linha',
    'documento_numero',
    'documento_revisao',
    'documento_descricao',
    'documento_responsavel',
    'atendente',
    'recebedor_colaborador_id',
    'recebedor_tipo',
    'recebedor',
    'recebedor_empresa',
    'recebedor_documento',
    'recebedor_telefone',
    'autorizador_interno',
    'motivo_retirada',
    'origem_registro',
    'atendimento_item_id',
    'documento_item_id',
    'codigo_material',
    'descricao_material',
    'unidade',
    'quantidade_no_lote',
    'quantidade_retirada_original',
    'quantidade_estornada_acumulada',
  ];

  const linhas: string[] = [header.join(CSV_EXCEL_SEP_ATD)];

  for (const at of atendimentos) {
    const docCab = docMap.get(at.documentoId);
    const docRev = docCab?.revisao ?? '';
    const docDesc = docCab?.descricao ?? '';
    const docResp = docCab?.responsavel ?? '';

    if (at.itens.length === 0) {
      linhas.push(
        linhaCsvLoteSemItens(at, docRev, docDesc, docResp)
          .map((c) => escapeCsvCellSemicolon(String(c)))
          .join(CSV_EXCEL_SEP_ATD),
      );
      continue;
    }

    for (const it of at.itens) {
      const docNumItem = String(it.documentoNumero?.trim() || at.documentoNumero || '-');
      const docItem = docMap.get(at.documentoId) ?? [...docMap.values()].find((d) => d.numero === docNumItem);
      const docRevItem = docItem?.revisao ?? docRev;
      const docDescItem = docItem?.descricao ?? docDesc;
      const docRespItem = docItem?.responsavel ?? docResp;
      const qtdLinha = Number(it.quantidadeAtendida) || 0;
      const podeLinha = at.status === 'concluido' && qtdLinha > 0 ? 'sim' : 'nao';
      const atendidoLinha = qtdLinha > 0 ? 'sim' : 'nao';
      const estornoPermitidoLinha = podeLinha;
      const qtdPodeEstornar = podeLinha === 'sim' ? formatDecimalExcelPtBr(qtdLinha) : '0';
      linhas.push(
        [
          at.numero,
          at.id,
          at.dataAtendimento,
          at.status,
          atendidoLinha,
          estornoPermitidoLinha,
          qtdPodeEstornar,
          podeLinha,
          docNumItem,
          docRevItem,
          docDescItem,
          docRespItem,
          at.atendente,
          at.recebedorColaboradorId ?? '',
          at.recebedorTipo,
          at.recebedor,
          at.recebedorEmpresa,
          at.recebedorDocumento,
          at.recebedorTelefone,
          at.autorizadorInterno,
          at.motivoRetirada,
          rotuloOrigemAtendimento(at.origem),
          it.id,
          it.documentoItemId,
          it.codigoMaterial,
          it.descricaoMaterial,
          it.unidade,
          formatDecimalExcelPtBr(Number(it.quantidadeAtendida)),
          formatDecimalExcelPtBr(quantidadeRetiradaOriginalItem(it)),
          formatDecimalExcelPtBr(quantidadeEstornadaAcumuladaItem(it)),
        ]
          .map((c) => escapeCsvCellSemicolon(String(c)))
          .join(CSV_EXCEL_SEP_ATD),
      );
    }
  }

  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = nomeArquivoExportAtendimentos(stamp);
  return { success: true, data: { csv, fileName } };
}

/** ZIP com CSV de atendimentos e CSV de log de estornos (auditoria). */
export async function montarExportacaoAtendimentosPacoteZip(): Promise<
  ServiceResult<{ zipBlob: Blob; fileName: string }>
> {
  const csvResult = await montarExportacaoAtendimentosCsvItens();
  if (!csvResult.success || !csvResult.data) {
    return { success: false, error: csvResult.error ?? 'Nao foi possivel gerar o CSV de atendimentos.' };
  }

  const estornoLog = await carregarEstornoLog();
  const csvEstorno = montarCsvEstornoLog(estornoLog);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const zip = new JSZip();
  zip.file(nomeArquivoExportAtendimentos(stamp), csvResult.data.csv);
  zip.file(nomeArquivoExportEstornoLog(stamp), csvEstorno);

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { success: true, data: { zipBlob, fileName: nomeArquivoExportAtendimentosZip(stamp) } };
}

export async function listarHistoricoAtendimentosComMeta(): Promise<ServiceResult<Atendimento[]>> {
  let source: 'supabase' | 'local' = 'local';
  let fallbackReason = '';
  let data: Atendimento[] = [];

  if (shouldTryRemoteRead()) {
    try {
      data = await withRemoteReadTimeout(() => readRemoteHistoricoAtendimentos(), REMOTE_READ_TIMEOUT_HEAVY_MS);
      source = 'supabase';
    } catch (error) {
      data = await listarHistoricoAtendimentos();
      if (!isIsoProDesktop()) {
        fallbackReason = traduzirErroOperacionalIsoPro(
          error instanceof Error ? error.message : 'Falha ao consultar historico de atendimentos no Supabase.',
        );
      }
    }
  } else if (hasSupabaseConfig() && isIsoProDesktop()) {
    const merged = await mesclarAtendimentoDesktopComNuvem();
    if (merged === 'ok') source = 'supabase';
    else if (merged === 'fail') {
      fallbackReason = 'Nao foi possivel alinhar o historico com a nuvem (mobile/web). Verifique ligacao ao Supabase.';
    }
    data = await listarHistoricoAtendimentos();
  } else {
    data = await listarHistoricoAtendimentos();
  }

  return {
    success: true,
    data: [...data].sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento)),
    meta: {
      source,
      fallbackReason: fallbackReason || undefined,
    },
  };
}

export async function registrarAtendimento(payload: {
  documentoId: string;
  atendente: string;
  recebedorTipo: AtendimentoRecebedorTipo;
  recebedorColaboradorId?: string | null;
  recebedor: string;
  recebedorEmpresa?: string;
  recebedorDocumento?: string;
  recebedorTelefone?: string;
  autorizadorInterno?: string;
  motivoRetirada?: string;
  /** Omitido ou `windows` = desktop; `mobile` = aplicativo movel. */
  origem?: 'windows' | 'mobile';
  itens: Array<{ documentoItemId: string; quantidade: number }>;
}): Promise<ServiceResult<Atendimento>> {
  if (!payload.atendente.trim()) return { success: false, error: 'Informe o atendente.' };
  if (!payload.itens.length) return { success: false, error: 'Informe ao menos um item para atender.' };
  const validatedItems = validateRequestedItems(payload.itens);
  if (!validatedItems.valid) {
    return { success: false, error: validatedItems.error };
  }
  const requestItems = validatedItems.items ?? [];

  let recebedorNome = payload.recebedor.trim();
  let recebedorColaboradorId: string | null = payload.recebedorColaboradorId?.trim() || null;
  let recebedorEmpresa = payload.recebedorEmpresa?.trim() ?? '';
  let recebedorDocumento = payload.recebedorDocumento?.trim() ?? '';
  let recebedorTelefone = payload.recebedorTelefone?.trim() ?? '';
  let recebedorMatricula = '';
  let recebedorFuncao = '';
  const autorizadorInterno = payload.autorizadorInterno?.trim() ?? '';
  const motivoRetirada = payload.motivoRetirada?.trim() ?? '';

  if (payload.recebedorTipo === 'interno') {
    if (!recebedorColaboradorId) return { success: false, error: 'Selecione um colaborador interno cadastrado.' };
    const colaboradorResult = await buscarColaboradorPorId(recebedorColaboradorId);
    if (!colaboradorResult.success || !colaboradorResult.data || !colaboradorResult.data.ativo) {
      return { success: false, error: 'Colaborador interno nao encontrado ou inativo.' };
    }
    if (colaboradorResult.data.tipo !== 'interno') {
      return { success: false, error: 'Selecione um colaborador interno valido para o atendimento.' };
    }
    recebedorNome = colaboradorResult.data.nome;
    recebedorEmpresa = colaboradorResult.data.empresa;
    recebedorDocumento = colaboradorResult.data.documento;
    recebedorTelefone = colaboradorResult.data.telefone;
    recebedorMatricula = String(colaboradorResult.data.matricula ?? '').trim();
    recebedorFuncao = String(colaboradorResult.data.funcao ?? '').trim();
  } else {
    if (!recebedorNome) return { success: false, error: 'Informe o nome de quem esta retirando.' };
    if (!recebedorEmpresa) return { success: false, error: 'Informe a empresa do retirante externo.' };
    if (!recebedorDocumento) return { success: false, error: 'Informe o documento do retirante externo.' };
    if (!recebedorTelefone) return { success: false, error: 'Informe o telefone do retirante externo.' };
    if (recebedorTelefone.replace(/\D/g, '').length < 8) {
      return { success: false, error: 'Informe um telefone valido para o retirante externo.' };
    }
    if (!autorizadorInterno) return { success: false, error: 'Informe quem autorizou internamente a retirada.' };
    if (!motivoRetirada) return { success: false, error: 'Informe o motivo da retirada externa.' };

    const externalResult = await registrarRetiranteExterno({
      nome: recebedorNome,
      empresa: recebedorEmpresa,
      documento: recebedorDocumento,
      telefone: recebedorTelefone,
      observacao: `${motivoRetirada}${autorizadorInterno ? ` | Autorizado por: ${autorizadorInterno}` : ''}`,
    });
    if (!externalResult.success || !externalResult.data) {
      return { success: false, error: externalResult.error ?? 'Nao foi possivel registrar o retirante externo.' };
    }
    recebedorColaboradorId = externalResult.data.id;
    recebedorMatricula = String(externalResult.data.matricula ?? '').trim();
    recebedorFuncao = String(externalResult.data.funcao ?? '').trim();
  }

  const colaboradoresAtivos = await listarColaboradoresAtivos();
  const colabAtendente = resolverColaboradorPorTextoAtendente(payload.atendente, colaboradoresAtivos);
  const atendenteMatricula = String(colabAtendente?.matricula ?? '').trim();
  const atendenteFuncao = String(colabAtendente?.funcao ?? '').trim();

  const remoteState = shouldTryRemoteRead()
    ? await readRemoteStateForWrite([payload.documentoId]).catch(() => null)
    : null;
  const localState = loadLocalState();
  const documentos = mesclarDocumentosLocaisComRemotos(
    localState.documentos,
    remoteState?.documentos ?? [],
  );
  const materiais =
    remoteState != null && remoteState.materiais.length > 0
      ? remoteState.materiais
      : await enrichMateriaisSaldoFromLocalMovement(localState.materiais, localState.documentos);
  const atendimentos = remoteState?.atendimentos ?? localState.atendimentos;

  let documentoIndex = documentos.findIndex((doc) => doc.id === payload.documentoId);
  if (documentoIndex === -1 && shouldTryRemoteRead()) {
    const docNuvem = await carregarDocumentoStoredDaNuvem(payload.documentoId);
    if (docNuvem) {
      documentos.push(docNuvem);
      documentoIndex = documentos.length - 1;
    }
  }
  if (documentoIndex === -1) {
    return { success: false, error: 'Documento nao encontrado. Recarregue a pagina e tente de novo.' };
  }

  const documento = documentos[documentoIndex];
  if (documento.status === 'cancelado') {
    return { success: false, error: 'Nao e possivel registrar atendimento para um documento cancelado.' };
  }
  if (documentoSemSaldoParaAtendimento(documento)) {
    return {
      success: false,
      error: `O documento ${documento.numero} rev. ${documento.revisao} nao aceita novo atendimento: toda a quantidade planejada deste documento ja foi atendida (nao ha saldo pendente por linha). Outros documentos nao sao afetados.`,
    };
  }
  const itensAtendidos: AtendimentoItem[] = [];
  const documentoItemById = new Map(documento.itens.map((item) => [item.id, item]));
  const materialByCode = new Map(materiais.map((material, index) => [codigoMaterialKey(material.codigo), { material, index }]));

  for (const requestItem of requestItems) {
    const documentoItem = documentoItemById.get(requestItem.documentoItemId);
    if (!documentoItem) {
      return { success: false, error: 'Item do documento nao encontrado.' };
    }

    const pendente = documentoItem.quantidadeProjeto - documentoItem.quantidadeAtendida;
    if (requestItem.quantidade > pendente) {
      return { success: false, error: `Quantidade maior que o pendente do item ${documentoItem.codigoMaterial}.` };
    }

    const materialEntry = materialByCode.get(codigoMaterialKey(documentoItem.codigoMaterial));
    if (!materialEntry) {
      return { success: false, error: `Material ${documentoItem.codigoMaterial} nao encontrado.` };
    }

    const material = materialEntry.material;

    if (requestItem.quantidade > (material.saldoAtual ?? 0)) {
      return { success: false, error: `Saldo insuficiente para o material ${documentoItem.codigoMaterial}.` };
    }

    documentoItem.quantidadeAtendida += requestItem.quantidade;
    material.saldoAtual = (material.saldoAtual ?? 0) - requestItem.quantidade;

    itensAtendidos.push({
      id: crypto.randomUUID(),
      documentoItemId: documentoItem.id,
      materialId: material.id,
      codigoMaterial: documentoItem.codigoMaterial,
      descricaoMaterial: documentoItem.descricaoMaterial,
      unidade: documentoItem.unidade,
      quantidadeAtendida: requestItem.quantidade,
      quantidadeRetiradaOriginal: requestItem.quantidade,
      documentoNumero: documento.numero,
    });
  }

  documento.status = deriveDocumentoStatus(documento);
  documentos[documentoIndex] = documento;

  const atendimento: Atendimento = {
    id: crypto.randomUUID(),
    numero: buildNumeroAtendimento(consumirSequenciaComSnapshot(remoteState?.payload ?? null)),
    documentoId: documento.id,
    documentoNumero: documento.numero,
    atendente: payload.atendente.trim(),
    atendenteMatricula,
    atendenteFuncao,
    recebedorTipo: payload.recebedorTipo,
    recebedorColaboradorId,
    recebedor: recebedorNome,
    recebedorMatricula,
    recebedorFuncao,
    recebedorEmpresa,
    recebedorDocumento,
    recebedorTelefone,
    autorizadorInterno,
    motivoRetirada,
    origem: payload.origem === 'mobile' ? 'mobile' : 'windows',
    status: 'concluido',
    dataAtendimento: new Date().toISOString(),
    itens: itensAtendidos,
  };

  atendimentos.push(atendimento);

  if (remoteState) {
    const bloqueioAtendimento = bloqueioLocalChavesAtendimento({
      documentosLength: documentos.length,
      materiaisLength: materiais.length,
      atendimentosLength: atendimentos.length,
    });
    if (bloqueioAtendimento) return { success: false, error: bloqueioAtendimento };
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () =>
        writeSnapshotAtendimentoPatch({ documentos: [documento], atendimentos: [atendimento] }),
      writeLocal: () => {
        writeJson(documentosKeyAtendimento(), documentos);
        writeJson(materiaisKeyAtendimento(), materiais);
        writeJson(atendimentosStorageKey(), atendimentos);
      },
      successData: atendimento,
      fallbackMessage: 'Falha ao salvar atendimento no Supabase.',
    });
  }
  const blockedSalvar = whenBusinessWriteBlockedResult<Atendimento>();
  if (blockedSalvar) return blockedSalvar;
  writeJson(documentosKeyAtendimento(), documentos);
  writeJson(materiaisKeyAtendimento(), materiais);
  writeJson(atendimentosStorageKey(), atendimentos);
  return { success: true, data: atendimento, meta: { source: 'local' } };
}

export type RegistrarAtendimentosSessaoPayload = {
  atendente: string;
  recebedorTipo: AtendimentoRecebedorTipo;
  recebedorColaboradorId?: string | null;
  recebedor: string;
  recebedorEmpresa?: string;
  recebedorDocumento?: string;
  recebedorTelefone?: string;
  autorizadorInterno?: string;
  motivoRetirada?: string;
  origem?: 'windows' | 'mobile';
  documentos: Array<{
    documentoId: string;
    itens: Array<{ documentoItemId: string; quantidade: number }>;
  }>;
};

/**
 * Registra varios lotes (um por documento) em uma unica operacao atomica.
 * Valida tudo antes de gravar; no Supabase usa um unico patch de snapshot.
 */
export async function registrarAtendimentosSessao(
  payload: RegistrarAtendimentosSessaoPayload,
): Promise<ServiceResult<Atendimento[]>> {
  if (!payload.atendente.trim()) return { success: false, error: 'Informe o atendente.' };
  const grupos = payload.documentos.filter((g) => g.itens.some((i) => i.quantidade > 0));
  if (!grupos.length) {
    return { success: false, error: 'Informe ao menos um item para atender.' };
  }

  const gruposValidados: Array<{ documentoId: string; itens: Array<{ documentoItemId: string; quantidade: number }> }> =
    [];
  for (const grupo of grupos) {
    const validated = validateRequestedItems(grupo.itens);
    if (!validated.valid) {
      return { success: false, error: validated.error };
    }
    gruposValidados.push({ documentoId: grupo.documentoId, itens: validated.items ?? [] });
  }

  let recebedorNome = payload.recebedor.trim();
  let recebedorColaboradorId: string | null = payload.recebedorColaboradorId?.trim() || null;
  let recebedorEmpresa = payload.recebedorEmpresa?.trim() ?? '';
  let recebedorDocumento = payload.recebedorDocumento?.trim() ?? '';
  let recebedorTelefone = payload.recebedorTelefone?.trim() ?? '';
  let recebedorMatricula = '';
  let recebedorFuncao = '';
  const autorizadorInterno = payload.autorizadorInterno?.trim() ?? '';
  const motivoRetirada = payload.motivoRetirada?.trim() ?? '';

  if (payload.recebedorTipo === 'interno') {
    if (!recebedorColaboradorId) return { success: false, error: 'Selecione um colaborador interno cadastrado.' };
    const colaboradorResult = await buscarColaboradorPorId(recebedorColaboradorId);
    if (!colaboradorResult.success || !colaboradorResult.data || !colaboradorResult.data.ativo) {
      return { success: false, error: 'Colaborador interno nao encontrado ou inativo.' };
    }
    if (colaboradorResult.data.tipo !== 'interno') {
      return { success: false, error: 'Selecione um colaborador interno valido para o atendimento.' };
    }
    recebedorNome = colaboradorResult.data.nome;
    recebedorEmpresa = colaboradorResult.data.empresa;
    recebedorDocumento = colaboradorResult.data.documento;
    recebedorTelefone = colaboradorResult.data.telefone;
    recebedorMatricula = String(colaboradorResult.data.matricula ?? '').trim();
    recebedorFuncao = String(colaboradorResult.data.funcao ?? '').trim();
  } else {
    if (!recebedorNome) return { success: false, error: 'Informe o nome de quem esta retirando.' };
    if (!recebedorEmpresa) return { success: false, error: 'Informe a empresa do retirante externo.' };
    if (!recebedorDocumento) return { success: false, error: 'Informe o documento do retirante externo.' };
    if (!recebedorTelefone) return { success: false, error: 'Informe o telefone do retirante externo.' };
    if (recebedorTelefone.replace(/\D/g, '').length < 8) {
      return { success: false, error: 'Informe um telefone valido para o retirante externo.' };
    }
    if (!autorizadorInterno) return { success: false, error: 'Informe quem autorizou internamente a retirada.' };
    if (!motivoRetirada) return { success: false, error: 'Informe o motivo da retirada externa.' };

    const externalResult = await registrarRetiranteExterno({
      nome: recebedorNome,
      empresa: recebedorEmpresa,
      documento: recebedorDocumento,
      telefone: recebedorTelefone,
      observacao: `${motivoRetirada}${autorizadorInterno ? ` | Autorizado por: ${autorizadorInterno}` : ''}`,
    });
    if (!externalResult.success || !externalResult.data) {
      return { success: false, error: externalResult.error ?? 'Nao foi possivel registrar o retirante externo.' };
    }
    recebedorColaboradorId = externalResult.data.id;
    recebedorMatricula = String(externalResult.data.matricula ?? '').trim();
    recebedorFuncao = String(externalResult.data.funcao ?? '').trim();
  }

  const colaboradoresAtivos = await listarColaboradoresAtivos();
  const colabAtendente = resolverColaboradorPorTextoAtendente(payload.atendente, colaboradoresAtivos);
  const atendenteMatricula = String(colabAtendente?.matricula ?? '').trim();
  const atendenteFuncao = String(colabAtendente?.funcao ?? '').trim();

  const remoteState = shouldTryRemoteRead()
    ? await readRemoteStateForWrite(gruposValidados.map((g) => g.documentoId)).catch(() => null)
    : null;
  const localState = loadLocalState();
  const documentos = mesclarDocumentosLocaisComRemotos(
    localState.documentos,
    remoteState?.documentos ?? [],
  );
  const materiais =
    remoteState != null && remoteState.materiais.length > 0
      ? remoteState.materiais
      : await enrichMateriaisSaldoFromLocalMovement(localState.materiais, localState.documentos);
  const atendimentos = remoteState?.atendimentos ?? localState.atendimentos;

  const materialByCode = new Map(materiais.map((material, index) => [codigoMaterialKey(material.codigo), { material, index }]));
  const saldoRestantePorCodigo = new Map<string, number>();
  for (const material of materiais) {
    saldoRestantePorCodigo.set(codigoMaterialKey(material.codigo), material.saldoAtual ?? 0);
  }

  const documentosMutados = new Map<string, DocumentoStored>();
  const novosAtendimentos: Atendimento[] = [];
  const dataAtendimento = new Date().toISOString();

  for (const grupo of gruposValidados) {
    let documentoIndex = documentos.findIndex((doc) => doc.id === grupo.documentoId);
    if (documentoIndex === -1 && shouldTryRemoteRead()) {
      // Documento veio do leitor/busca remota e pode nao estar na copia local: ultima tentativa direta.
      const docNuvem = await carregarDocumentoStoredDaNuvem(grupo.documentoId);
      if (docNuvem) {
        documentos.push(docNuvem);
        documentoIndex = documentos.length - 1;
      }
    }
    if (documentoIndex === -1) {
      return { success: false, error: 'Documento nao encontrado. Recarregue a pagina e tente de novo.' };
    }

    const documento = documentosMutados.get(grupo.documentoId) ?? { ...documentos[documentoIndex] };
    if (documento.status === 'cancelado') {
      return { success: false, error: 'Nao e possivel registrar atendimento para um documento cancelado.' };
    }
    if (documentoSemSaldoParaAtendimento(documento)) {
      return {
        success: false,
        error: `O documento ${documento.numero} rev. ${documento.revisao} nao aceita novo atendimento: toda a quantidade planejada deste documento ja foi atendida.`,
      };
    }

    const documentoItemById = new Map(documento.itens.map((item) => [item.id, item]));
    const itensAtendidos: AtendimentoItem[] = [];

    for (const requestItem of grupo.itens) {
      const documentoItem = documentoItemById.get(requestItem.documentoItemId);
      if (!documentoItem) {
        return { success: false, error: 'Item do documento nao encontrado.' };
      }

      const pendente = documentoItem.quantidadeProjeto - documentoItem.quantidadeAtendida;
      if (requestItem.quantidade > pendente) {
        return {
          success: false,
          error: `Quantidade maior que o pendente do item ${documentoItem.codigoMaterial} no documento ${documento.numero}.`,
        };
      }

      const materialEntry = materialByCode.get(codigoMaterialKey(documentoItem.codigoMaterial));
      if (!materialEntry) {
        return { success: false, error: `Material ${documentoItem.codigoMaterial} nao encontrado.` };
      }

      const codigoKey = codigoMaterialKey(documentoItem.codigoMaterial);
      const saldoRestante = saldoRestantePorCodigo.get(codigoKey) ?? 0;
      if (requestItem.quantidade > saldoRestante) {
        return {
          success: false,
          error: `Saldo insuficiente para o material ${documentoItem.codigoMaterial} (considerando todos os desenhos desta retirada).`,
        };
      }

      documentoItem.quantidadeAtendida += requestItem.quantidade;
      materialEntry.material.saldoAtual = (materialEntry.material.saldoAtual ?? 0) - requestItem.quantidade;
      saldoRestantePorCodigo.set(codigoKey, saldoRestante - requestItem.quantidade);

      itensAtendidos.push({
        id: crypto.randomUUID(),
        documentoItemId: documentoItem.id,
        materialId: materialEntry.material.id,
        codigoMaterial: documentoItem.codigoMaterial,
        descricaoMaterial: documentoItem.descricaoMaterial,
        unidade: documentoItem.unidade,
        quantidadeAtendida: requestItem.quantidade,
        quantidadeRetiradaOriginal: requestItem.quantidade,
        documentoNumero: documento.numero,
      });
    }

    documento.status = deriveDocumentoStatus(documento);
    documentosMutados.set(grupo.documentoId, documento);
    documentos[documentoIndex] = documento;

    const atendimento: Atendimento = {
      id: crypto.randomUUID(),
      numero: buildNumeroAtendimento(consumirSequenciaComSnapshot(remoteState?.payload ?? null)),
      documentoId: documento.id,
      documentoNumero: documento.numero,
      atendente: payload.atendente.trim(),
      atendenteMatricula,
      atendenteFuncao,
      recebedorTipo: payload.recebedorTipo,
      recebedorColaboradorId,
      recebedor: recebedorNome,
      recebedorMatricula,
      recebedorFuncao,
      recebedorEmpresa,
      recebedorDocumento,
      recebedorTelefone,
      autorizadorInterno,
      motivoRetirada,
      origem: payload.origem === 'mobile' ? 'mobile' : 'windows',
      status: 'concluido',
      dataAtendimento,
      itens: itensAtendidos,
    };
    novosAtendimentos.push(atendimento);
    atendimentos.push(atendimento);
  }

  const documentosPatch = [...documentosMutados.values()];

  if (remoteState) {
    const bloqueioAtendimento = bloqueioLocalChavesAtendimento({
      documentosLength: documentos.length,
      materiaisLength: materiais.length,
      atendimentosLength: atendimentos.length,
    });
    if (bloqueioAtendimento) return { success: false, error: bloqueioAtendimento };
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () =>
        writeSnapshotAtendimentoPatch({
          documentos: documentosPatch,
          atendimentos: novosAtendimentos,
        }),
      writeLocal: () => {
        writeJson(documentosKeyAtendimento(), documentos);
        writeJson(materiaisKeyAtendimento(), materiais);
        writeJson(atendimentosStorageKey(), atendimentos);
      },
      successData: novosAtendimentos,
      fallbackMessage: 'Falha ao salvar sessao de atendimento no Supabase.',
    });
  }
  const blockedSalvar = whenBusinessWriteBlockedResult<Atendimento[]>();
  if (blockedSalvar) return blockedSalvar;
  writeJson(documentosKeyAtendimento(), documentos);
  writeJson(materiaisKeyAtendimento(), materiais);
  writeJson(atendimentosStorageKey(), atendimentos);
  return { success: true, data: novosAtendimentos, meta: { source: 'local' } };
}

/**
 * Estorna quantidades do atendimento no documento e no saldo de materiais.
 * Se `linhasEstorno` for omitido ou vazio, estorna todo o lote (comportamento anterior).
 * Caso contrario, apenas as linhas e quantidades indicadas; o lote permanece `concluido` se ainda houver itens.
 *
 * Escopo deliberado: estorno (devolucao ao estoque) existe apenas no PC/desktop e na web.
 * O app Campo regista somente retiradas — exige perfil administrador e recibo de estorno auditavel.
 *
 * SoT (V2): tabelas `iso_pro_atendimento_*` via `iso_pro_estornar_atendimento_v2`.
 * Snapshot/`documentos` = projecao compatível; o caminho legado abaixo so corre se a RPC V2
 * estiver ausente (`rpcMissing`) ou a feature flag desligada (`VITE_ISO_PRO_ESTORNO_V2=false`).
 */
export async function estornarAtendimento(
  id: string,
  linhasEstorno?: EstornoAtendimentoLinha[],
  meta?: EstornoAtendimentoMeta,
): Promise<ServiceResult<Atendimento>> {
  // Estorno V2: RPC transacional (tabelas SoT). Fallback automatico se RPC faltar.
  if (shouldTryRemoteRead()) {
    const { isEstornoV2FeatureEnabled, estornarAtendimentoV2 } = await import('./estornoAtendimentoV2');
    if (isEstornoV2FeatureEnabled()) {
      const v2 = await estornarAtendimentoV2(id, linhasEstorno, meta);
      if (v2.success) {
        // Espelho local minimo (lista de lotes) — sem rewrite de documentos[].
        try {
          const local = loadLocalState();
          const atendimentos = [...local.atendimentos];
          let idx = atendimentos.findIndex((a) => a.id === id);
          if (idx === -1 && v2.data) {
            idx = atendimentos.findIndex((a) => a.numero === v2.data!.numero);
          }
          if (idx >= 0 && v2.data) atendimentos[idx] = v2.data;
          else if (v2.data) atendimentos.push(v2.data);
          writeJson(atendimentosStorageKey(), atendimentos);
        } catch {
          /* ignore */
        }
        return { ...v2, meta: { ...v2.meta, source: 'supabase' } };
      }
      if (!v2.meta?.rpcMissing) {
        return v2;
      }
      // RPC ausente → caminho legado abaixo.
    }
  }

  const localState = loadLocalState();
  let remoteState: Awaited<ReturnType<typeof readRemoteState>> | null = null;
  if (shouldTryRemoteRead()) {
    try {
      // Caminho minimo: atendimento da UI + RPC dos desenhos + fatia leve de atendimentos.
      // Nao usa readRemoteStateForWrite (puxava historico + 26k linhas de escala → timeout falso).
      const fromUi = meta?.atendimentoSnapshot;
      const { slices: lightSlices } = await readIsoProSnapshotSlicesForWrite([
        'atendimentos',
        'atendimentoEstornoLog',
      ]);
      const atendimentosNuvem = mapAtendimentosFromSnapshotArray({
        atendimentos: lightSlices.atendimentos as SnapshotPayload['atendimentos'],
      });
      const atParaDocs =
        atendimentosNuvem.find((item) => item.id === id) ??
        (fromUi
          ? atendimentosNuvem.find((item) => String(item.numero ?? '') === String(fromUi.numero ?? ''))
          : undefined) ??
        fromUi;
      if (!atParaDocs) {
        return {
          success: false,
          error:
            'Atendimento nao encontrado na nuvem para estorno. Recarregue a pagina (Ctrl+F5) e tente de novo.',
        };
      }
      // Preferir itens da UI (tem documentoNumero por linha nos MULTIPLOS).
      const atComItens =
        fromUi && fromUi.itens.length > 0
          ? { ...atParaDocs, itens: fromUi.itens, documentoNumero: fromUi.documentoNumero }
          : atParaDocs;
      const docs = await carregarDocumentosParaEstorno(atComItens);
      if (docs.length === 0) {
        return {
          success: false,
          error:
            'Nao foi possivel carregar os desenhos deste lote na nuvem. Verifique a ligacao e tente de novo.',
        };
      }
      remoteState = {
        payload: lightSlices as SnapshotPayload,
        documentos: docs,
        materiais: localState.materiais,
        atendimentos: atendimentosNuvem,
        estornoLog: mapEstornoLogFromSnapshot(
          lightSlices.atendimentoEstornoLog as SnapshotPayload['atendimentoEstornoLog'],
        ),
      };
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Falha ao preparar estorno na nuvem.';
      const translated = traduzirErroOperacionalIsoPro(raw);
      // Timeout de leitura no estorno nao e "usar cache" — e falha real de preparacao.
      if (raw.toLowerCase().includes('timeout')) {
        return {
          success: false,
          error:
            'A preparacao do estorno demorou demais na nuvem. Feche o modal, Ctrl+F5 e tente de novo. Se for lote MULTIPLOS, aguarde ate 3 minutos na confirmacao.',
        };
      }
      return { success: false, error: translated };
    }
  }
  let atendimentos = remoteState?.atendimentos ?? localState.atendimentos;
  // So os desenhos do lote (remotos) — nao misturar com cache local enorme/stale.
  const documentos =
    remoteState?.documentos?.length
      ? remoteState.documentos
      : mesclarDocumentosLocaisComRemotos(localState.documentos, []);
  const materiais = localState.materiais;

  let atendimentoIndex = atendimentos.findIndex((item) => item.id === id);
  if (atendimentoIndex === -1 && meta?.atendimentoSnapshot) {
    atendimentoIndex = atendimentos.findIndex(
      (item) => String(item.numero ?? '') === String(meta.atendimentoSnapshot!.numero ?? ''),
    );
  }
  if (atendimentoIndex === -1 && meta?.atendimentoSnapshot) {
    atendimentos = [...atendimentos, meta.atendimentoSnapshot];
    atendimentoIndex = atendimentos.length - 1;
  }
  if (atendimentoIndex === -1) return { success: false, error: 'Atendimento nao encontrado.' };

  const atendimento = atendimentos[atendimentoIndex];
  if (atendimento.status === 'estornado') {
    return { success: false, error: 'Atendimento ja estornado.' };
  }

  const materialByCode = new Map(materiais.map((material) => [codigoMaterialKey(material.codigo), material]));

  const linhasEfetivas: EstornoAtendimentoLinha[] =
    linhasEstorno && linhasEstorno.length > 0
      ? linhasEstorno
      : atendimento.itens.map((i) => ({ atendimentoItemId: i.id, quantidade: i.quantidadeAtendida }));

  if (linhasEfetivas.length === 0) {
    return { success: false, error: 'Nenhuma linha para estornar.' };
  }

  const porItemId = new Map<string, number>();
  for (const lin of linhasEfetivas) {
    const itemId = lin.atendimentoItemId?.trim();
    if (!itemId) {
      return { success: false, error: 'Item de estorno invalido.' };
    }
    const q = Number(lin.quantidade);
    if (!Number.isFinite(q) || q <= 0) {
      return { success: false, error: 'Quantidade de estorno invalida.' };
    }
    porItemId.set(itemId, (porItemId.get(itemId) ?? 0) + q);
  }

  const workingItems: AtendimentoItem[] = atendimento.itens.map((i) => ({
    ...i,
    quantidadeRetiradaOriginal: quantidadeRetiradaOriginalItem(i),
  }));
  const documentosAlterados = new Set<number>();
  const estornoLogAppend: EstornoLogRegistro[] = [];
  const dataEstorno = new Date().toISOString();

  for (const [itemId, qTotal] of porItemId) {
    const idx = workingItems.findIndex((i) => i.id === itemId);
    if (idx === -1) {
      return { success: false, error: 'Item do atendimento nao encontrado para estorno.' };
    }
    const item = workingItems[idx];
    if (qTotal > item.quantidadeAtendida) {
      return {
        success: false,
        error: `Quantidade a estornar maior que a registrada no item (${item.codigoMaterial}).`,
      };
    }

    const docIdx = resolverIndiceDocumentoParaItemEstorno(documentos, atendimento, item);
    if (docIdx === -1) {
      return {
        success: false,
        error: `Documento nao encontrado no planejamento para estornar ${item.codigoMaterial}. Verifique os desenhos vinculados ao lote.`,
      };
    }

    const documento = documentos[docIdx]!;
    const documentoItem = encontrarLinhaDocumentoParaItemEstorno(documento, item);
    if (documentoItem) {
      documentoItem.quantidadeAtendida = Math.max(0, documentoItem.quantidadeAtendida - qTotal);
    }

    const material = materialByCode.get(codigoMaterialKey(item.codigoMaterial));
    if (material) {
      material.saldoAtual = (material.saldoAtual ?? 0) + qTotal;
    }

    const retiradaOriginal = quantidadeRetiradaOriginalItem(item);
    const novaQ = item.quantidadeAtendida - qTotal;
    if (novaQ <= 0) {
      workingItems.splice(idx, 1);
    } else {
      workingItems[idx] = {
        ...item,
        quantidadeAtendida: novaQ,
        quantidadeRetiradaOriginal: retiradaOriginal,
      };
    }

    documento.status = deriveDocumentoStatus(documento);
    documentos[docIdx] = documento;
    documentosAlterados.add(docIdx);

    estornoLogAppend.push({
      id: crypto.randomUUID(),
      dataEstorno,
      loteNumero: atendimento.numero,
      loteId: atendimento.id,
      atendimentoItemId: itemId,
      documentoNumero: String(item.documentoNumero?.trim() || atendimento.documentoNumero || ''),
      codigoMaterial: item.codigoMaterial,
      descricaoMaterial: item.descricaoMaterial,
      unidade: item.unidade,
      quantidadeEstornada: qTotal,
      quantidadeRetiradaOriginal: retiradaOriginal,
      quantidadeRestanteNoLote: Math.max(0, novaQ),
      nomeQuemEstorna: String(meta?.nomeQuemEstorna ?? '').trim(),
      nomeQuemDevolve: String(meta?.nomeQuemDevolve ?? '').trim(),
      motivoEstorno: String(meta?.motivoEstorno ?? '').trim(),
      estornoParcialLote: true,
    });
  }

  const documentosPatch = [...documentosAlterados].map((i) => documentos[i]!);

  const novoStatus: Atendimento['status'] = workingItems.length === 0 ? 'estornado' : 'concluido';
  for (const entry of estornoLogAppend) {
    entry.estornoParcialLote = novoStatus === 'concluido';
  }
  const atendimentoAtualizado: Atendimento = {
    ...atendimento,
    itens: workingItems,
    status: novoStatus,
  };
  atendimentos[atendimentoIndex] = atendimentoAtualizado;

  // Nunca substituir a lista local pela fatia da nuvem (ex.: 16 na nuvem vs 40 no PC).
  // O comando remoto ja e patch por id; o local so atualiza o lote + docs alterados.
  const atendimentosParaLocal = (() => {
    const base = [...localState.atendimentos];
    let idx = base.findIndex((item) => item.id === atendimentoAtualizado.id);
    if (idx === -1) {
      idx = base.findIndex(
        (item) => String(item.numero ?? '') === String(atendimentoAtualizado.numero ?? ''),
      );
    }
    if (idx === -1) base.push(atendimentoAtualizado);
    else base[idx] = atendimentoAtualizado;
    return base;
  })();
  // Overlay dos desenhos do lote (com qAt ja revertida) sobre a lista local completa.
  const documentosParaLocal = mesclarDocumentosLocaisComRemotos(localState.documentos, documentos);

  const appendEstornoLogLocal = () => {
    if (!estornoLogAppend.length) return;
    const existing = readJson<EstornoLogRegistro>(estornoLogStorageKey());
    writeJson(estornoLogStorageKey(), [...existing, ...estornoLogAppend]);
  };

  if (remoteState) {
    // Estorno e patch delta (1 lote + docs alterados + log). Nao aplicar o guarda de
    // "substituicao de lista completa" — ele compara localStorage com a fatia da nuvem
    // e bloqueava estornos validos (ex.: 40 no PC vs 15 em atendimentos[]).
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () =>
        writeSnapshotAtendimentoPatch({
          documentos: documentosPatch,
          atendimentos: [atendimentoAtualizado],
          estornoLogAppend,
        }),
      writeLocal: () => {
        writeJson(documentosKeyAtendimento(), documentosParaLocal);
        writeJson(materiaisKeyAtendimento(), materiais);
        writeJson(atendimentosStorageKey(), atendimentosParaLocal);
        appendEstornoLogLocal();
      },
      successData: atendimentoAtualizado,
      fallbackMessage: 'Falha ao estornar atendimento no Supabase.',
    });
  }
  const blockedEstorno = whenBusinessWriteBlockedResult<Atendimento>();
  if (blockedEstorno) return blockedEstorno;
  writeJson(documentosKeyAtendimento(), documentosParaLocal);
  writeJson(materiaisKeyAtendimento(), materiais);
  writeJson(atendimentosStorageKey(), atendimentosParaLocal);
  appendEstornoLogLocal();
  return { success: true, data: atendimentoAtualizado, meta: { source: 'local' } };
}
