import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { hasSupabaseConfig, shouldUseCloudMaterials } from '../../../lib/supabase';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
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
import { resolverColaboradorPorTextoAtendente } from '../utils/resolverColaboradorPorTextoAtendente';
import { consumirSequenciaAtendimento } from '../../configuracoes/services/configuracoes.service';
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
} from '../types/atendimento.types';

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
    }>;
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
  };
}

async function readSnapshotPayload(): Promise<SnapshotPayload> {
  return await readIsoProSnapshotPayload<SnapshotPayload>();
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
    })),
  };
}

function buildAtendimentoHistoricoFromAtendimentos(atendimentos: Atendimento[]): SnapshotHistoricoRecord[] {
  return atendimentos.flatMap((atendimento) =>
    atendimento.itens.map((item) => ({
      id: item.id,
      loteNumero: atendimento.numero,
      data: atendimento.dataAtendimento,
      documentoId: atendimento.documentoId,
      documento: atendimento.documentoNumero,
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

/** Grava documento(s) e atendimento(s) com merge por `id` sobre o snapshot fresco (concorrência). */
async function writeSnapshotAtendimentoPatch(patch: {
  documentos?: DocumentoStored[];
  atendimentos?: Atendimento[];
}): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    const currentDocumentos = (currentPayload.documentos ?? []) as SnapshotDocumentoRecord[];
    const currentAtendimentos = (currentPayload.atendimentos ?? []) as SnapshotAtendimentoRecord[];

    const documentos = patch.documentos?.length
      ? mergeSnapshotRowsById(currentDocumentos, patch.documentos.map(documentoStoredToSnapshotRecord))
      : currentDocumentos;

    const atendimentosSnapshot = patch.atendimentos?.length
      ? mergeSnapshotRowsById(currentAtendimentos, patch.atendimentos.map(atendimentoToSnapshotRecord))
      : currentAtendimentos;

    const atendimentosMerged = mapAtendimentosFromSnapshotArray({
      ...currentPayload,
      atendimentos: atendimentosSnapshot,
    });
    const atendimentoHistorico = buildAtendimentoHistoricoFromAtendimentos(atendimentosMerged);

    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        documentos,
        atendimentos: atendimentosSnapshot,
        atendimentoHistorico,
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
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

/** Saldo recebimentos − já atendido (+ ajustes), igual ao mobile e à lista de Materiais após recálculo. */
async function obterSaldoMapOperacional(): Promise<Map<string, number>> {
  if (hasSupabaseConfig()) {
    try {
      const payload = await readSnapshotPayload();
      const documentosRec = documentosReconciliadosDoPayload(payload);
      return buildSaldoMap(montarSaldoPayloadComDocumentosReconciliados(payload, documentosRec));
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

async function resolveDocumentosEMateriaisAtendimento(): Promise<{
  documentos: DocumentoStored[];
  materiais: MaterialStored[];
}> {
  if (hasSupabaseConfig()) {
    try {
      const state = await readRemoteState();
      return { documentos: state.documentos, materiais: state.materiais };
    } catch {
      const local = loadLocalState();
      const recebimentos = await carregarRecebimentosCompletos();
      const payload = buildLocalPayloadParaReconciliacao(local, recebimentos);
      const documentos = documentosReconciliadosDoPayload(payload);
      return {
        documentos,
        materiais: await enrichMateriaisSaldoFromLocalMovement(local.materiais, documentos),
      };
    }
  }
  const local = loadLocalState();
  const recebimentos = await carregarRecebimentosCompletos();
  const payloadLocal = buildLocalPayloadParaReconciliacao(local, recebimentos);
  const documentos = documentosReconciliadosDoPayload(payloadLocal);
  return {
    documentos,
    materiais: await enrichMateriaisSaldoFromLocalMovement(local.materiais, documentos),
  };
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
  return payload.atendimentos.map((atendimento, index) => ({
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
      documentoNumero: String(atendimento.documentoNumero ?? ''),
    })),
  }));
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

/** Agrupa linhas planas do historico (formato mobile / legado) por `loteNumero`. */
function mapAtendimentosFromHistoricoGrouped(payload: SnapshotPayload): Atendimento[] {
  const grouped = new Map<string, Atendimento>();
  for (const raw of payload.atendimentoHistorico ?? []) {
    const numero = String(raw.loteNumero ?? '');
    if (!numero) continue;
    const current =
      grouped.get(numero) ??
      {
        id: numero,
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
      documentoItemId: '',
      materialId: null,
      codigoMaterial: String(raw.codigo ?? ''),
      descricaoMaterial: String(raw.descricao ?? ''),
      unidade: String(raw.unidade ?? 'UN'),
      quantidadeAtendida: Number(raw.quantidade ?? 0),
      documentoNumero: String(raw.documento ?? ''),
    });

    grouped.set(numero, current);
  }

  return Array.from(grouped.values());
}

/**
 * O app movel grava atendimentos em `atendimentoHistorico` (linhas por material).
 * O PC grava tambem o array `atendimentos` (lotes agregados). Se existir `atendimentos`,
 * a listagem antiga ignorava o historico — lotes criados so no telefone sumiam na lista do PC.
 */
function mapSnapshotAtendimentos(payload: SnapshotPayload): Atendimento[] {
  const porNumero = new Map<string, Atendimento>();
  for (const a of mapAtendimentosFromSnapshotArray(payload)) {
    porNumero.set(a.numero, a);
  }
  for (const a of mapAtendimentosFromHistoricoGrouped(payload)) {
    if (!porNumero.has(a.numero)) {
      porNumero.set(a.numero, a);
    }
  }
  return Array.from(porNumero.values()).sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento));
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
    documentos: documentosRec,
    materiais,
    atendimentos: mapSnapshotAtendimentos(payload),
  };
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
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ATD-${stamp}-${String(index).padStart(4, '0')}`;
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

export async function listarDocumentosPendentes(): Promise<AtendimentoDocumento[]> {
  const { documentos, materiais } = await resolveDocumentosEMateriaisAtendimento();

  const materialByCode = new Map(materiais.map((material) => [codigoMaterialKey(material.codigo), material]));
  const saldoMap = await obterSaldoMapOperacional();

  return documentos
    .filter((doc) => doc.status !== 'cancelado')
    .map((doc) => ({
      id: doc.id,
      numero: doc.numero,
      revisao: doc.revisao,
      descricao: doc.descricao,
      responsavel: doc.responsavel,
      status: doc.status,
      linhas: doc.itens
        .map((item) => {
          const key = codigoMaterialKey(item.codigoMaterial);
          const material = materialByCode.get(key);
          const saldoOperacional = saldoMap.get(key);
          /** Antes: só `material?.saldoAtual` — se o código não entrou no merge snapshot+cadastro, ficava 0 com NF já conferida. */
          const saldo =
            saldoOperacional !== undefined ? saldoOperacional : (material?.saldoAtual ?? 0);
          const pendente = Math.max(0, item.quantidadeProjeto - item.quantidadeAtendida);

          return {
            documentoItemId: item.id,
            materialId: material?.id ?? null,
            codigoMaterial: item.codigoMaterial,
            descricaoMaterial: item.descricaoMaterial,
            unidade: item.unidade,
            quantidadeProjeto: item.quantidadeProjeto,
            quantidadeAtendida: item.quantidadeAtendida,
            quantidadePendente: pendente,
            saldoDisponivel: saldo,
            quantidadeNestaOperacao: 0,
          };
        })
        .filter((item) => item.quantidadePendente > 0),
    }))
    .filter((doc) => doc.linhas.length > 0)
    .sort((a, b) => a.numero.localeCompare(b.numero));
}

export async function listarDocumentosPendentesComMeta(): Promise<ServiceResult<AtendimentoDocumento[]>> {
  let source: 'supabase' | 'local' = 'local';
  let fallbackReason = '';

  try {
    if (hasSupabaseConfig()) {
      await readRemoteState();
      source = 'supabase';
    }
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : 'Falha ao consultar documentos pendentes no Supabase.';
  }

  const data = await listarDocumentosPendentes();
  return {
    success: true,
    data,
    meta: {
      source,
      fallbackReason: fallbackReason || undefined,
    },
  };
}

export async function listarHistoricoAtendimentos(): Promise<Atendimento[]> {
  const items = hasSupabaseConfig()
    ? await readRemoteState().then((state) => state.atendimentos).catch(() => readJson<Atendimento>(atendimentosStorageKey()))
    : readJson<Atendimento>(atendimentosStorageKey());
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

  for (const at of atendimentos) {
    if (!idSet.has(at.documentoId)) continue;
    const cur = porDoc.get(at.documentoId) ?? { count: 0, lotes: [] };
    cur.count += 1;
    if (cur.lotes.length < 10) cur.lotes.push(at.numero);
    porDoc.set(at.documentoId, cur);
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

const CSV_EXCEL_SEP_ATD = ';';

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
  ];

  const linhas: string[] = [header.join(CSV_EXCEL_SEP_ATD)];

  for (const at of atendimentos) {
    const doc = docMap.get(at.documentoId);
    const docDesc = doc?.descricao ?? '';
    const docRev = doc?.revisao ?? '';
    const docResp = doc?.responsavel ?? '';

    if (at.itens.length === 0) {
      linhas.push(
        linhaCsvLoteSemItens(at, docRev, docDesc, docResp)
          .map((c) => escapeCsvCellSemicolon(String(c)))
          .join(CSV_EXCEL_SEP_ATD),
      );
      continue;
    }

    for (const it of at.itens) {
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
          it.id,
          it.documentoItemId,
          it.codigoMaterial,
          it.descricaoMaterial,
          it.unidade,
          formatDecimalExcelPtBr(Number(it.quantidadeAtendida)),
        ]
          .map((c) => escapeCsvCellSemicolon(String(c)))
          .join(CSV_EXCEL_SEP_ATD),
      );
    }
  }

  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `iso-pro-atendimentos-materiais-${stamp}.csv`;
  return { success: true, data: { csv, fileName } };
}

export async function listarHistoricoAtendimentosComMeta(): Promise<ServiceResult<Atendimento[]>> {
  let source: 'supabase' | 'local' = 'local';
  let fallbackReason = '';

  try {
    if (hasSupabaseConfig()) {
      await readRemoteState();
      source = 'supabase';
    }
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : 'Falha ao consultar historico de atendimentos no Supabase.';
  }

  const data = await listarHistoricoAtendimentos();
  return {
    success: true,
    data,
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

  const remoteState = hasSupabaseConfig() ? await readRemoteState().catch(() => null) : null;
  const localState = loadLocalState();
  const documentos = remoteState?.documentos ?? localState.documentos;
  const materiais =
    remoteState != null && remoteState.materiais.length > 0
      ? remoteState.materiais
      : await enrichMateriaisSaldoFromLocalMovement(localState.materiais, localState.documentos);
  const atendimentos = remoteState?.atendimentos ?? localState.atendimentos;

  const documentoIndex = documentos.findIndex((doc) => doc.id === payload.documentoId);
  if (documentoIndex === -1) return { success: false, error: 'Documento nao encontrado.' };

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
    });
  }

  documento.status = deriveDocumentoStatus(documento);
  documentos[documentoIndex] = documento;

  const atendimento: Atendimento = {
    id: crypto.randomUUID(),
    numero: buildNumeroAtendimento(consumirSequenciaAtendimento()),
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

  const remoteState = hasSupabaseConfig() ? await readRemoteState().catch(() => null) : null;
  const localState = loadLocalState();
  const documentos = remoteState?.documentos ?? localState.documentos;
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
    const documentoIndex = documentos.findIndex((doc) => doc.id === grupo.documentoId);
    if (documentoIndex === -1) {
      return { success: false, error: 'Documento nao encontrado.' };
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
      });
    }

    documento.status = deriveDocumentoStatus(documento);
    documentosMutados.set(grupo.documentoId, documento);
    documentos[documentoIndex] = documento;

    const atendimento: Atendimento = {
      id: crypto.randomUUID(),
      numero: buildNumeroAtendimento(consumirSequenciaAtendimento()),
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
 */
export async function estornarAtendimento(
  id: string,
  linhasEstorno?: EstornoAtendimentoLinha[],
): Promise<ServiceResult<Atendimento>> {
  const remoteState = hasSupabaseConfig() ? await readRemoteState().catch(() => null) : null;
  const localState = loadLocalState();
  const atendimentos = remoteState?.atendimentos ?? localState.atendimentos;
  const documentos = remoteState?.documentos ?? localState.documentos;
  const materiais =
    remoteState != null && remoteState.materiais.length > 0
      ? remoteState.materiais
      : await enrichMateriaisSaldoFromLocalMovement(localState.materiais, localState.documentos);

  const atendimentoIndex = atendimentos.findIndex((item) => item.id === id);
  if (atendimentoIndex === -1) return { success: false, error: 'Atendimento nao encontrado.' };

  const atendimento = atendimentos[atendimentoIndex];
  if (atendimento.status === 'estornado') {
    return { success: false, error: 'Atendimento ja estornado.' };
  }

  const documentoIndex = documentos.findIndex((item) => item.id === atendimento.documentoId);
  if (documentoIndex === -1) return { success: false, error: 'Documento do atendimento nao encontrado.' };

  const documento = documentos[documentoIndex];
  const documentoItemById = new Map(documento.itens.map((item) => [item.id, item]));
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

  const workingItems: AtendimentoItem[] = atendimento.itens.map((i) => ({ ...i }));

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

    const documentoItem = documentoItemById.get(item.documentoItemId);
    if (documentoItem) {
      documentoItem.quantidadeAtendida = Math.max(0, documentoItem.quantidadeAtendida - qTotal);
    }

    const material = materialByCode.get(codigoMaterialKey(item.codigoMaterial));
    if (material) {
      material.saldoAtual = (material.saldoAtual ?? 0) + qTotal;
    }

    const novaQ = item.quantidadeAtendida - qTotal;
    if (novaQ <= 0) {
      workingItems.splice(idx, 1);
    } else {
      workingItems[idx] = { ...item, quantidadeAtendida: novaQ };
    }
  }

  documento.status = deriveDocumentoStatus(documento);
  documentos[documentoIndex] = documento;

  const novoStatus: Atendimento['status'] = workingItems.length === 0 ? 'estornado' : 'concluido';
  atendimentos[atendimentoIndex] = { ...atendimento, itens: workingItems, status: novoStatus };

  if (remoteState) {
    const bloqueioEstorno = bloqueioLocalChavesAtendimento({
      documentosLength: documentos.length,
      materiaisLength: materiais.length,
      atendimentosLength: atendimentos.length,
    });
    if (bloqueioEstorno) return { success: false, error: bloqueioEstorno };
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () =>
        writeSnapshotAtendimentoPatch({
          documentos: [documento],
          atendimentos: [atendimentos[atendimentoIndex]],
        }),
      writeLocal: () => {
        writeJson(documentosKeyAtendimento(), documentos);
        writeJson(materiaisKeyAtendimento(), materiais);
        writeJson(atendimentosStorageKey(), atendimentos);
      },
      successData: atendimentos[atendimentoIndex],
      fallbackMessage: 'Falha ao estornar atendimento no Supabase.',
    });
  }
  const blockedEstorno = whenBusinessWriteBlockedResult<Atendimento>();
  if (blockedEstorno) return blockedEstorno;
  writeJson(documentosKeyAtendimento(), documentos);
  writeJson(materiaisKeyAtendimento(), materiais);
  writeJson(atendimentosStorageKey(), atendimentos);
  return { success: true, data: atendimentos[atendimentoIndex], meta: { source: 'local' } };
}
