import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { parseRecebimentosImportJsonRoot } from '../../../lib/schemas/importArquivoPlano.zod';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  commitIsoProSnapshotWrite,
  invalidateIsoProSnapshotCache,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { extrairCodigoMaterialDeObjetoImport } from '../../../lib/codigoMaterialImport';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { coerceRecebimentoQuantidade, roundPesoKg } from '../../../lib/parseDecimal';
import { normalizarDataFlexivelParaIso } from '../../../lib/normalizeFlexibleDateToIso';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import type {
  Recebimento,
  RecebimentoFiltro,
  RecebimentoFormData,
  RecebimentoItem,
  RecebimentoListItem,
  RecebimentosArquivoExportacao,
  RecebimentosImportacaoResumo,
} from '../types/recebimento.types';
import { recebimentoCorrespondeBuscaInteligente } from '../utils/recebimentoBusca';
import {
  construirIndiceDisciplinaUnidadePorCodigoMaterial,
  construirIndicePesoPorCodigoMaterial,
  validarCodigosMateriaisAtivosNoCadastroParaRecebimento,
} from '../../materiais/services/materiais.service';
import {
  resolverNomeFornecedorCadastradoAtivo,
  validarNomesFornecedoresCadastradosAtivos,
} from '../../fornecedores/services/fornecedores.service';
import {
  construirJsonImportacaoRecebimentosPlanoCsv,
  montarModeloCsvImportacaoRecebimentos,
  montarModeloCsvImportacaoRecebimentosItens,
} from './recebimentos.import.csv';
import { parseRecebimentosPersistidos } from '../schemas/recebimentoPersistido.zod';
import {
  IMPORT_COOPERATIVE_MIN_CSV_ROWS,
  yieldCooperativeEveryRows,
  yieldToMain,
} from '../../../lib/yieldCooperativeImport';

export { montarModeloCsvImportacaoRecebimentos, montarModeloCsvImportacaoRecebimentosItens };
export { previewImportacaoRecebimentosCsv } from './recebimentos.import.csv';

const RECEBIMENTOS_STORAGE_BASE = 'iso-pro-desktop-recebimentos';

function recebimentosStorageKey(): string {
  return getScopedIsoProStorageKey(RECEBIMENTOS_STORAGE_BASE);
}

function bloqueioLocalRecebimentos(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: recebimentosStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'recebimento(s)' },
  ]);
}

export const RECEBIMENTOS_EXPORT_SCHEMA_VERSION = 1;

const seedData: Recebimento[] = [
  {
    id: 'rec-1',
    fornecedor: 'Fornecedor A - Tubos Ltda',
    dataRecebimento: '2026-04-02',
    notaFiscal: 'NF-778810',
    romaneio: 'ROM-100',
    conferente: 'Carlos Lima',
    modoRecebimento: 'aguardando_conferencia',
    status: 'aguardando_conferencia',
    observacoes: '',
    itens: [
      {
        id: 'rec-1-item-1',
        codigoMaterial: 'TB-0001',
        descricaoMaterial: 'Tubo inox 2 polegadas',
        unidade: 'UN',
        disciplina: 'Tubulacao',
        localizacao: 'A-01',
        quantidadeRecebida: 12,
        quantidadeConferida: 0,
        pesoUnitario: 2.5,
        pesoTotal: 30,
        certificado: '',
      },
    ],
  },
  {
    id: 'rec-2',
    fornecedor: 'Fornecedor B - Conexoes S/A',
    dataRecebimento: '2026-04-01',
    notaFiscal: 'NF-778811',
    romaneio: 'ROM-101',
    conferente: 'Mariana Costa',
    modoRecebimento: 'direto',
    status: 'conferido',
    observacoes: 'Recebimento direto liberado.',
    itens: [
      {
        id: 'rec-2-item-1',
        codigoMaterial: 'EL-0102',
        descricaoMaterial: 'Cabo eletrico 10mm',
        unidade: 'M',
        disciplina: 'Eletrica',
        localizacao: 'B-EST-03',
        quantidadeRecebida: 200,
        quantidadeConferida: 200,
        pesoUnitario: 0.15,
        pesoTotal: 30,
        certificado: '',
      },
    ],
  },
];

function deriveStatus(form: RecebimentoFormData): Recebimento['status'] {
  return form.modoRecebimento === 'direto' ? 'conferido' : 'aguardando_conferencia';
}

function coerceDataRecebimentoStored(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return normalizarDataFlexivelParaIso(t) || t;
}

function normalizeRecebimentoPayload(payload: RecebimentoFormData): RecebimentoFormData {
  return {
    ...payload,
    fornecedor: payload.fornecedor.trim(),
    dataRecebimento: coerceDataRecebimentoStored(payload.dataRecebimento),
    notaFiscal: payload.notaFiscal.trim(),
    romaneio: payload.romaneio.trim(),
    conferente: payload.conferente.trim(),
    observacoes: payload.observacoes.trim(),
    itens: payload.itens.map((item) => ({
      ...item,
      codigoMaterial: item.codigoMaterial.trim(),
      descricaoMaterial: item.descricaoMaterial.trim(),
      unidade: item.unidade.trim(),
      disciplina: item.disciplina.trim(),
      localizacao: String(item.localizacao ?? '').trim(),
      quantidadeRecebida: coerceRecebimentoQuantidade(item.quantidadeRecebida ?? 0),
      quantidadeConferida: coerceRecebimentoQuantidade(item.quantidadeConferida ?? 0),
      pesoUnitario: coerceRecebimentoQuantidade(item.pesoUnitario ?? 0),
      pesoTotal: coerceRecebimentoQuantidade(item.pesoTotal ?? 0),
      certificado: String(item.certificado ?? '').trim(),
    })),
  };
}

function validateRecebimentoPayload(payload: RecebimentoFormData, items: Recebimento[], currentId?: string): string | null {
  if (!payload.fornecedor) return 'Informe o fornecedor.';
  if (!payload.dataRecebimento) return 'Informe a data do recebimento.';
  if (!payload.notaFiscal && !payload.romaneio) return 'Informe a nota fiscal ou o romaneio.';
  if (!payload.itens.length) return 'Adicione pelo menos um item ao recebimento.';
  if (payload.modoRecebimento === 'aguardando_conferencia' && !payload.conferente) {
    return 'Informe o conferente responsavel.';
  }

  const hasInvalidItem = payload.itens.some(
    (item) =>
      !item.codigoMaterial ||
      !item.descricaoMaterial ||
      !item.localizacao ||
      !item.unidade ||
      item.quantidadeRecebida <= 0 ||
      item.quantidadeConferida < 0 ||
      item.quantidadeConferida > item.quantidadeRecebida ||
      (item.pesoUnitario ?? 0) < 0 ||
      (item.pesoTotal ?? 0) < 0,
  );
  if (hasInvalidItem) {
    return 'Revise os itens do recebimento. Codigo, descricao, localizacao e quantidades validas sao obrigatorios.';
  }

  const duplicatedItemCodes = new Set<string>();
  for (const item of payload.itens) {
    const key = normalizeLookupValue(item.codigoMaterial);
    if (duplicatedItemCodes.has(key)) {
      return `Nao e permitido repetir o material ${item.codigoMaterial} no mesmo recebimento.`;
    }
    duplicatedItemCodes.add(key);
  }

  const duplicated = items.find(
    (item) =>
      item.id !== currentId &&
      normalizeLookupValue(item.fornecedor) === normalizeLookupValue(payload.fornecedor) &&
      item.dataRecebimento === payload.dataRecebimento &&
      normalizeLookupValue(item.notaFiscal) === normalizeLookupValue(payload.notaFiscal) &&
      normalizeLookupValue(item.romaneio) === normalizeLookupValue(payload.romaneio),
  );
  if (duplicated) {
    return 'Ja existe um recebimento com o mesmo fornecedor, data, nota fiscal e romaneio.';
  }

  return null;
}

function normalizarItemPeso(item: RecebimentoItem): RecebimentoItem {
  const qr = coerceRecebimentoQuantidade(item.quantidadeRecebida ?? 0);
  const qc = coerceRecebimentoQuantidade(item.quantidadeConferida ?? 0);
  const pu = coerceRecebimentoQuantidade(item.pesoUnitario ?? 0);
  const pt = coerceRecebimentoQuantidade(item.pesoTotal ?? 0);
  return {
    ...item,
    quantidadeRecebida: qr,
    quantidadeConferida: qc,
    certificado: String(item.certificado ?? '').trim(),
    observacaoItem: String(item.observacaoItem ?? '').trim(),
    pesoUnitario: roundPesoKg(pu),
    pesoTotal: roundPesoKg(pt),
  };
}

function aplicarPesoCadastroUmItem(item: RecebimentoItem, pesoPorCodigo: Map<string, number>): RecebimentoItem {
  const base = normalizarItemPeso(item);
  const pesoCad = pesoPorCodigo.get(normalizeLookupValue(base.codigoMaterial));
  if (pesoCad == null || pesoCad <= 0) return base;
  const q = Number(base.quantidadeRecebida) || 0;
  const pu = pesoCad;
  const pt = roundPesoKg(q * pu);
  return { ...base, pesoUnitario: roundPesoKg(pu), pesoTotal: pt };
}

/** Alinha disciplina, unidade e peso ao cadastro de materiais quando o codigo bate (valores do cadastro prevalecem). */
function aplicarCadastroMateriaisLinhaRecebimento(
  item: RecebimentoItem,
  pesoPorCodigo: Map<string, number>,
  disciplinaUnidadePorCodigo: Map<string, { disciplina: string; unidade: string }> | null,
): RecebimentoItem {
  const base = aplicarPesoCadastroUmItem(item, pesoPorCodigo);
  if (!disciplinaUnidadePorCodigo?.size) return base;
  const ext = disciplinaUnidadePorCodigo.get(normalizeLookupValue(base.codigoMaterial));
  if (!ext) return base;
  let out = base;
  if (ext.disciplina.trim()) {
    out = { ...out, disciplina: ext.disciplina.trim() };
  }
  if (ext.unidade.trim()) {
    out = { ...out, unidade: ext.unidade.trim() };
  }
  return out;
}

async function enriquecerRecebimentosComPesoCadastroMateriais(recs: Recebimento[]): Promise<Recebimento[]> {
  let pesoPorCodigo = new Map<string, number>();
  try {
    pesoPorCodigo = await construirIndicePesoPorCodigoMaterial();
  } catch {
    /* cadastro indisponivel: segue sem peso do catalogo */
  }
  let disciplinaUnidadePorCodigo: Map<string, { disciplina: string; unidade: string }> | null = null;
  try {
    disciplinaUnidadePorCodigo = await construirIndiceDisciplinaUnidadePorCodigoMaterial();
  } catch {
    disciplinaUnidadePorCodigo = null;
  }
  return recs.map((rec) => ({
    ...rec,
    itens: rec.itens.map((it) => aplicarCadastroMateriaisLinhaRecebimento(it, pesoPorCodigo, disciplinaUnidadePorCodigo)),
  }));
}

/**
 * Alinha linhas ao cadastro de materiais pelo codigo: peso unitario/total (se peso no cadastro > 0), disciplina e unidade.
 */
export async function enriquecerItensRecebimentoComPesoCadastroMateriais(
  itens: RecebimentoItem[],
): Promise<RecebimentoItem[]> {
  let pesoPorCodigo = new Map<string, number>();
  try {
    pesoPorCodigo = await construirIndicePesoPorCodigoMaterial();
  } catch {
    /* */
  }
  let disciplinaUnidadePorCodigo: Map<string, { disciplina: string; unidade: string }> | null = null;
  try {
    disciplinaUnidadePorCodigo = await construirIndiceDisciplinaUnidadePorCodigoMaterial();
  } catch {
    disciplinaUnidadePorCodigo = null;
  }
  return itens.map((item) => aplicarCadastroMateriaisLinhaRecebimento(item, pesoPorCodigo, disciplinaUnidadePorCodigo));
}

function normalizarRecebimentoItensLegado(rec: Recebimento): Recebimento {
  return { ...rec, itens: rec.itens.map(normalizarItemPeso) };
}

function readAll(): Recebimento[] {
  const raw = localStorage.getItem(recebimentosStorageKey());
  if (!raw) {
    localStorage.setItem(recebimentosStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseRecebimentosPersistidos(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Recebimentos', recebimentosStorageKey());
      return [];
    }
    return validated.map(normalizarRecebimentoItensLegado);
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Recebimentos', recebimentosStorageKey());
    return [];
  }
}

function writeAll(items: Recebimento[]) {
  localStorage.setItem(recebimentosStorageKey(), JSON.stringify(items));
}

async function loadRecebimentos(): Promise<Recebimento[]> {
  const raw = hasSupabaseConfig() ? await readSnapshotRecebimentos().catch(() => readAll()) : readAll();
  return enriquecerRecebimentosComPesoCadastroMateriais(raw);
}

/** Carrega todos os recebimentos (Supabase com fallback local) — usado no planejamento de documentos. */
export async function carregarRecebimentosCompletos(): Promise<Recebimento[]> {
  const { data } = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotRecebimentos(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar recebimentos no Supabase.',
  });
  return enriquecerRecebimentosComPesoCadastroMateriais(data);
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

type SnapshotPayload = {
  recebimentos?: Array<{
    id?: string | number;
    data?: string;
    fornecedorNome?: string;
    nota?: string;
    romaneio?: string;
    conferenteNome?: string;
    observacoes?: string;
    modoRecebimento?: 'direto' | 'aguardando_conferencia';
    statusConferencia?: 'pendente' | 'conferido' | null;
    /** App móvel / fluxo de conferência — legado pode ter `modo` errado mas este campo preenchido. */
    dataConferencia?: string;
    data_conferencia?: string;
    itens?: Array<{
      codigo?: string;
      descricao?: string;
      unidade?: string;
      disciplina?: string;
      localizacao?: string;
      certificado?: string;
      quantidade?: number | string;
      quantidadeConferida?: number | string | null;
      pesoUnitario?: number | string | null;
      pesoTotal?: number | string | null;
      observacaoItem?: string;
    }>;
  }>;
};

async function readSnapshotRecebimentos(): Promise<Recebimento[]> {
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
  return (payload.recebimentos ?? []).map((rec, index) => ({
    id: String(rec.id ?? `rec-${index + 1}`),
    fornecedor: String(rec.fornecedorNome ?? ''),
    dataRecebimento: (() => {
      const raw = String(rec.data ?? '').trim();
      if (!raw) return new Date().toISOString().slice(0, 10);
      return coerceDataRecebimentoStored(raw);
    })(),
    notaFiscal: String(rec.nota ?? ''),
    romaneio: String(rec.romaneio ?? ''),
    conferente: String(rec.conferenteNome ?? ''),
    dataConferencia: (() => {
      const raw = (rec as { dataConferencia?: unknown; data_conferencia?: unknown }).dataConferencia ??
        (rec as { data_conferencia?: unknown }).data_conferencia;
      const s = raw != null ? String(raw).trim() : '';
      return s || undefined;
    })(),
    modoRecebimento: rec.modoRecebimento ?? 'direto',
    status:
      rec.statusConferencia === 'conferido'
        ? 'conferido'
        : (rec.modoRecebimento ?? 'direto') === 'aguardando_conferencia'
          ? 'aguardando_conferencia'
          : 'conferido',
    observacoes: String(rec.observacoes ?? ''),
    itens: (rec.itens ?? []).map((item, itemIndex) =>
      normalizarItemPeso({
        id: `${rec.id ?? index}-item-${itemIndex + 1}`,
        codigoMaterial: String(item.codigo ?? ''),
        descricaoMaterial: String(item.descricao ?? ''),
        unidade: String(item.unidade ?? 'UN'),
        disciplina: String(item.disciplina ?? ''),
        localizacao: String(item.localizacao ?? ''),
        quantidadeRecebida: coerceRecebimentoQuantidade(item.quantidade),
        quantidadeConferida: coerceRecebimentoQuantidade(item.quantidadeConferida),
        pesoUnitario: coerceRecebimentoQuantidade(item.pesoUnitario ?? 0),
        pesoTotal: coerceRecebimentoQuantidade(item.pesoTotal ?? 0),
        certificado: String(item.certificado ?? ''),
        observacaoItem: String(item.observacaoItem ?? '').trim(),
      }),
    ),
  }));
}

async function writeSnapshotRecebimentos(items: Recebimento[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        recebimentos: items.map((item) => ({
          id: item.id,
          data: item.dataRecebimento,
          fornecedorNome: item.fornecedor,
          nota: item.notaFiscal,
          romaneio: item.romaneio,
          conferenteNome: item.conferente,
          observacoes: item.observacoes,
          modoRecebimento: item.modoRecebimento,
          ...(item.dataConferencia?.trim() ? { dataConferencia: item.dataConferencia.trim() } : {}),
          statusConferencia: item.status === 'conferido' ? 'conferido' : 'pendente',
          itens: item.itens.map((recItem) => ({
            codigo: recItem.codigoMaterial,
            descricao: recItem.descricaoMaterial,
            unidade: recItem.unidade,
            disciplina: recItem.disciplina,
            localizacao: recItem.localizacao,
            certificado: String(recItem.certificado ?? '').trim(),
            quantidade: recItem.quantidadeRecebida,
            quantidadeConferida: recItem.quantidadeConferida,
            pesoUnitario: recItem.pesoUnitario ?? 0,
            pesoTotal: recItem.pesoTotal ?? 0,
            observacaoItem: String(recItem.observacaoItem ?? '').trim(),
          })),
        })),
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
}

/** Mesma regra da listagem (busca, status, modo), sem paginacao. */
export function aplicarFiltrosListaRecebimentos(
  items: Recebimento[],
  filtro: Pick<RecebimentoFiltro, 'busca' | 'status' | 'modo'>,
): Recebimento[] {
  let result = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim();
    result = result.filter((item) => recebimentoCorrespondeBuscaInteligente(item, busca));
  }
  if (filtro.status !== 'todos') {
    result = result.filter((item) => item.status === filtro.status);
  }
  if (filtro.modo !== 'todos') {
    result = result.filter((item) => item.modoRecebimento === filtro.modo);
  }
  return [...result].sort((a, b) => b.dataRecebimento.localeCompare(a.dataRecebimento));
}

/** Recebimentos ja conferidos nao podem ser apagados por este fluxo (integridade de estoque/conferencia). */
function statusPermiteExclusaoDefinitivaRecebimento(status: Recebimento['status']): boolean {
  return status === 'aguardando_conferencia' || status === 'cancelado' || status === 'rascunho';
}

function statusPermiteDestravarRecebimentoParaCorrecao(status: Recebimento['status']): boolean {
  return status === 'conferido' || status === 'parcialmente_conferido' || status === 'divergente';
}

export type DestravarRecebimentoParaCorrecaoOpcoes = {
  actorLogin?: string;
};

function auditarDestravarRecebimentoParaCorrecao(
  rec: Pick<Recebimento, 'notaFiscal' | 'romaneio' | 'fornecedor'>,
  opcoes?: DestravarRecebimentoParaCorrecaoOpcoes,
) {
  appendAuthAuditEvent({
    type: 'recebimento_destravado_correcao',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Recebimento ${rec.notaFiscal || '-'} / ${rec.romaneio || '-'} (${rec.fornecedor}) destravado para correcao (volta a aguardar conferencia).`,
  });
}

export type ExcluirRecebimentoDefinitivamenteOpcoes = {
  actorLogin?: string;
};

function auditarExclusaoDefinitivaRecebimento(
  rec: Pick<Recebimento, 'notaFiscal' | 'romaneio' | 'fornecedor'>,
  opcoes?: ExcluirRecebimentoDefinitivamenteOpcoes,
) {
  appendAuthAuditEvent({
    type: 'recebimento_excluido_definitivamente',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Recebimento ${rec.notaFiscal || '-'} / ${rec.romaneio || '-'} (${rec.fornecedor}) excluido definitivamente.`,
  });
}

function auditarExclusaoDefinitivaRecebimentosVarios(removidos: Recebimento[], opcoes?: ExcluirRecebimentoDefinitivamenteOpcoes) {
  if (removidos.length === 1) {
    auditarExclusaoDefinitivaRecebimento(removidos[0], opcoes);
    return;
  }
  appendAuthAuditEvent({
    type: 'recebimentos_excluidos_definitivamente',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Excluidos ${removidos.length} recebimento(s). Amostra: ${removidos
      .slice(0, 30)
      .map((r) => `${r.notaFiscal || '-'}|${r.romaneio || '-'}`)
      .join('; ')}${removidos.length > 30 ? '...' : ''}`,
  });
}

function toListItem(item: Recebimento): RecebimentoListItem {
  /** Modo direto «puro» ignora divergência de linhas; legado com `dataConferencia` segue regra de conferência. */
  const modoDiretoSemFluxoConferencia =
    item.modoRecebimento === 'direto' && !item.dataConferencia?.trim();
  const conferenciaItensDivergentes = modoDiretoSemFluxoConferencia
    ? 0
    : item.itens.filter(
        (i) => Number(i.quantidadeRecebida) > 0 && Number(i.quantidadeConferida) < Number(i.quantidadeRecebida),
      ).length;
  return {
    id: item.id,
    fornecedor: item.fornecedor,
    dataRecebimento: item.dataRecebimento,
    notaFiscal: item.notaFiscal,
    romaneio: item.romaneio,
    conferente: item.conferente,
    modoRecebimento: item.modoRecebimento,
    dataConferencia: item.dataConferencia,
    status: item.status,
    totalItens: item.itens.length,
    quantidadeRecebidaTotal: item.itens.reduce((total, current) => total + current.quantidadeRecebida, 0),
    quantidadeConferidaTotal: item.itens.reduce((total, current) => total + current.quantidadeConferida, 0),
    conferenciaItensDivergentes,
  };
}

function deriveConferenciaStatus(itens: Recebimento['itens']): Recebimento['status'] {
  if (!itens.length) return 'aguardando_conferencia';
  const totaisConferidos = itens.filter((item) => item.quantidadeConferida >= item.quantidadeRecebida).length;
  const algumConferido = itens.some((item) => item.quantidadeConferida > 0);
  const divergente = itens.some((item) => item.quantidadeConferida > item.quantidadeRecebida);

  if (divergente) return 'divergente';
  if (totaisConferidos === itens.length) return 'conferido';
  if (algumConferido) return 'parcialmente_conferido';
  return 'aguardando_conferencia';
}

function validateConferenciaPayload(
  current: Recebimento,
  payload: { conferente: string; itens: Array<{ id: string; quantidadeConferida: number }> },
) {
  if (!payload.conferente.trim()) {
    return 'Informe o conferente responsavel.';
  }

  if (!payload.itens.length) {
    return 'Informe ao menos um item para conferencia.';
  }

  const seenItemIds = new Set<string>();
  let changedItems = 0;

  for (const item of payload.itens) {
    if (!item.id.trim()) {
      return 'Existe item de conferencia sem identificacao valida.';
    }
    if (seenItemIds.has(item.id)) {
      return 'Nao e permitido repetir o mesmo item na conferencia.';
    }
    seenItemIds.add(item.id);

    if (!Number.isFinite(item.quantidadeConferida) || item.quantidadeConferida < 0) {
      return 'As quantidades conferidas precisam ser numericas e maiores ou iguais a zero.';
    }

    const currentItem = current.itens.find((entry) => entry.id === item.id);
    if (!currentItem) {
      return 'Item da conferencia nao encontrado no recebimento.';
    }

    if (item.quantidadeConferida > currentItem.quantidadeRecebida) {
      return `A quantidade conferida do material ${currentItem.codigoMaterial} nao pode exceder a quantidade recebida.`;
    }

    if (item.quantidadeConferida !== currentItem.quantidadeConferida) {
      changedItems += 1;
    }
  }

  if (!changedItems) {
    return 'Nenhuma alteracao de conferencia foi informada para este recebimento.';
  }

  return null;
}

export async function listarRecebimentos(
  filtro: RecebimentoFiltro,
): Promise<ServiceResult<PaginatedResult<RecebimentoListItem>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotRecebimentos(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar recebimentos no Supabase.',
  });
  const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(fallbackResult.data);
  const items = aplicarFiltrosListaRecebimentos(enriched, filtro);
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

/** IDs de todos os recebimentos que correspondem ao filtro (ignora paginacao). */
export async function obterIdsRecebimentosFiltrados(filtro: RecebimentoFiltro): Promise<ServiceResult<string[]>> {
  try {
    const fallbackResult = await withLocalFallback({
      shouldTryRemote: hasSupabaseConfig(),
      loadRemote: () => readSnapshotRecebimentos(),
      loadLocal: () => readAll(),
      fallbackMessage: 'Falha ao consultar recebimentos no Supabase.',
    });
    const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(fallbackResult.data);
    const filtered = aplicarFiltrosListaRecebimentos(enriched, filtro);
    return { success: true, data: filtered.map((r) => r.id) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao listar recebimentos.' };
  }
}

export async function obterResumosRecebimentosParaExclusao(
  ids: string[],
): Promise<ServiceResult<Array<{ notaFiscal: string; romaneio: string; fornecedor: string }>>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { success: true, data: [] };
  try {
    const fallbackResult = await withLocalFallback({
      shouldTryRemote: hasSupabaseConfig(),
      loadRemote: () => readSnapshotRecebimentos(),
      loadLocal: () => readAll(),
      fallbackMessage: 'Falha ao consultar recebimentos no Supabase.',
    });
    const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(fallbackResult.data);
    const idSet = new Set(unique);
    const res = enriched
      .filter((r) => idSet.has(r.id))
      .map((r) => ({ notaFiscal: r.notaFiscal, romaneio: r.romaneio, fornecedor: r.fornecedor }))
      .sort((a, b) => a.fornecedor.localeCompare(b.fornecedor) || a.notaFiscal.localeCompare(b.notaFiscal));
    return { success: true, data: res };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao carregar resumo dos recebimentos.' };
  }
}

export async function salvarRecebimento(
  payload: RecebimentoFormData,
  currentId?: string,
): Promise<ServiceResult<Recebimento>> {
  if (hasSupabaseConfig()) {
    try {
      const items = await readSnapshotRecebimentos();
      const normalizedBase = normalizeRecebimentoPayload(payload);
      let normalized = {
        ...normalizedBase,
        itens: await enriquecerItensRecebimentoComPesoCadastroMateriais(normalizedBase.itens),
      };
      const resolvedFornecedor = await resolverNomeFornecedorCadastradoAtivo(normalized.fornecedor);
      if (!resolvedFornecedor) {
        return {
          success: false,
          error:
            'Fornecedor nao cadastrado no sistema. Cadastre em Fornecedores antes de salvar o recebimento.',
        };
      }
      normalized = { ...normalized, fornecedor: resolvedFornecedor };
      const materialErro = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
        normalized.itens.map((it) => it.codigoMaterial),
        'salvar',
      );
      if (materialErro) return { success: false, error: materialErro };
      const validationError = validateRecebimentoPayload(normalized, items, currentId);
      if (validationError) return { success: false, error: validationError };

      if (currentId) {
        const index = items.findIndex((item) => item.id === currentId);
        if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };
        if (items[index].status === 'cancelado') return { success: false, error: 'Nao e possivel editar um recebimento cancelado.' };
        if (items[index].status !== 'aguardando_conferencia') {
          return { success: false, error: 'Recebimentos com conferencia iniciada nao podem ser editados por este fluxo.' };
        }
        items[index] = { ...normalized, id: currentId, status: deriveStatus(normalized) };
        const bloqueioEdit = bloqueioLocalRecebimentos(items.length);
        if (bloqueioEdit) return { success: false, error: bloqueioEdit };
        const writeEdit = await executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotRecebimentos(items),
          writeLocal: () => writeAll(items),
          successData: items[index],
          fallbackMessage: 'Falha ao salvar recebimento no Supabase.',
        });
        return writeEdit;
      }

      const created: Recebimento = {
        ...normalized,
        id: crypto.randomUUID(),
        status: deriveStatus(normalized),
      };
      items.push(created);
      const bloqueioNovo = bloqueioLocalRecebimentos(items.length);
      if (bloqueioNovo) return { success: false, error: bloqueioNovo };
      const writeNew = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos(items),
        writeLocal: () => writeAll(items),
        successData: created,
        fallbackMessage: 'Falha ao salvar recebimento no Supabase.',
      });
      return writeNew;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar recebimento no Supabase.' };
    }
  }

  const items = readAll();
  const normalizedBase = normalizeRecebimentoPayload(payload);
  let normalized = {
    ...normalizedBase,
    itens: await enriquecerItensRecebimentoComPesoCadastroMateriais(normalizedBase.itens),
  };
  const resolvedFornecedorLocal = await resolverNomeFornecedorCadastradoAtivo(normalized.fornecedor);
  if (!resolvedFornecedorLocal) {
    return {
      success: false,
      error: 'Fornecedor nao cadastrado no sistema. Cadastre em Fornecedores antes de salvar o recebimento.',
    };
  }
  normalized = { ...normalized, fornecedor: resolvedFornecedorLocal };
  const materialErroLocal = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
    normalized.itens.map((it) => it.codigoMaterial),
    'salvar',
  );
  if (materialErroLocal) return { success: false, error: materialErroLocal };
  const validationError = validateRecebimentoPayload(normalized, items, currentId);
  if (validationError) return { success: false, error: validationError };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };
    if (items[index].status === 'cancelado') return { success: false, error: 'Nao e possivel editar um recebimento cancelado.' };
    if (items[index].status !== 'aguardando_conferencia') {
      return { success: false, error: 'Recebimentos com conferencia iniciada nao podem ser editados por este fluxo.' };
    }
    items[index] = { ...normalized, id: currentId, status: deriveStatus(normalized) };
    writeAll(items);
    return { success: true, data: items[index] };
  }

  const created: Recebimento = {
    ...normalized,
    id: crypto.randomUUID(),
    status: deriveStatus(normalized),
  };

  items.push(created);
  writeAll(items);
  return { success: true, data: created };
}

export async function cancelarRecebimento(id: string): Promise<ServiceResult<Recebimento>> {
  if (hasSupabaseConfig()) {
    try {
      const items = await readSnapshotRecebimentos();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };
      if (items[index].status === 'cancelado') return { success: false, error: 'Recebimento ja cancelado.' };
      if (items[index].status !== 'aguardando_conferencia') {
        return { success: false, error: 'Recebimentos com conferencia iniciada nao podem ser cancelados por este fluxo.' };
      }
      items[index] = { ...items[index], status: 'cancelado' };
      const bloqueioCancel = bloqueioLocalRecebimentos(items.length);
      if (bloqueioCancel) return { success: false, error: bloqueioCancel };
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos(items),
        writeLocal: () => writeAll(items),
        successData: items[index],
        fallbackMessage: 'Falha ao cancelar recebimento no Supabase.',
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao cancelar recebimento no Supabase.' };
    }
  }

  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };
  if (items[index].status === 'cancelado') return { success: false, error: 'Recebimento ja cancelado.' };
  if (items[index].status !== 'aguardando_conferencia') {
    return { success: false, error: 'Recebimentos com conferencia iniciada nao podem ser cancelados por este fluxo.' };
  }

  items[index] = { ...items[index], status: 'cancelado' };
  writeAll(items);
  return { success: true, data: items[index] };
}

/**
 * Volta o recebimento para aguardando conferencia (quantidades conferidas zeradas) para permitir edicao, cancelamento ou exclusao.
 * Senha e permissao administrar ficam na UI.
 */
export async function destravarRecebimentoParaCorrecaoAdministrativa(
  id: string,
  opcoes?: DestravarRecebimentoParaCorrecaoOpcoes,
): Promise<ServiceResult<Recebimento>> {
  const aplicarDestravamento = (items: Recebimento[], idx: number): Recebimento => {
    const atual = items[idx];
    const atualizado: Recebimento = {
      ...atual,
      modoRecebimento: 'aguardando_conferencia',
      status: 'aguardando_conferencia',
      itens: atual.itens.map((it) => ({
        ...it,
        quantidadeConferida: 0,
      })),
    };
    items[idx] = atualizado;
    return atualizado;
  };

  if (hasSupabaseConfig()) {
    try {
      const items = await readSnapshotRecebimentos();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };
      if (items[index].status === 'cancelado') {
        return { success: false, error: 'Recebimentos cancelados nao podem ser destravados por este fluxo.' };
      }
      if (!statusPermiteDestravarRecebimentoParaCorrecao(items[index].status)) {
        return {
          success: false,
          error:
            'So e possivel destravar recebimentos conferidos (total ou parcial) ou divergentes. Use edicao normal se ja estiver aguardando conferencia.',
        };
      }
      const antes = items[index];
      const atualizado = aplicarDestravamento(items, index);
      const bloqueioDestravar = bloqueioLocalRecebimentos(items.length);
      if (bloqueioDestravar) return { success: false, error: bloqueioDestravar };
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos(items),
        writeLocal: () => writeAll(items),
        successData: atualizado,
        fallbackMessage: 'Falha ao destravar recebimento no Supabase.',
      });
      if (writeResult.success) {
        invalidateIsoProSnapshotCache();
        auditarDestravarRecebimentoParaCorrecao(antes, opcoes);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao destravar recebimento no Supabase.' };
    }
  }

  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };
  if (items[index].status === 'cancelado') {
    return { success: false, error: 'Recebimentos cancelados nao podem ser destravados por este fluxo.' };
  }
  if (!statusPermiteDestravarRecebimentoParaCorrecao(items[index].status)) {
    return {
      success: false,
      error:
        'So e possivel destravar recebimentos conferidos (total ou parcial) ou divergentes. Use edicao normal se ja estiver aguardando conferencia.',
    };
  }
  const antes = items[index];
  const atualizado = aplicarDestravamento(items, index);
  writeAll(items);
  invalidateIsoProSnapshotCache();
  auditarDestravarRecebimentoParaCorrecao(antes, opcoes);
  return { success: true, data: atualizado, meta: { source: 'local' as const } };
}

/**
 * Remove recebimentos do snapshot/local numa unica gravacao. So permitido para aguardando conferencia, cancelado ou rascunho.
 * Confirmacao de senha e permissao administrar ficam na UI.
 */
export async function excluirRecebimentosDefinitivamente(
  ids: string[],
  opcoes?: ExcluirRecebimentoDefinitivamenteOpcoes,
): Promise<ServiceResult<{ removidos: number }>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) {
    return { success: false, error: 'Nenhum recebimento selecionado.' };
  }
  const idSet = new Set(unique);

  if (hasSupabaseConfig()) {
    try {
      const items = await readSnapshotRecebimentos();
      const removidos = items.filter((item) => idSet.has(item.id));
      if (removidos.length !== unique.length) {
        return { success: false, error: 'Alguns recebimentos nao foram encontrados.' };
      }
      const bloqueados = removidos.filter((r) => !statusPermiteExclusaoDefinitivaRecebimento(r.status));
      if (bloqueados.length) {
        return {
          success: false,
          error:
            'Exclusao definitiva so e permitida para recebimentos em aguardando conferencia, cancelados ou rascunho. Retire da selecao os que ja foram conferidos (parcial ou total) ou estao divergentes.',
        };
      }
      const next = items.filter((item) => !idSet.has(item.id));

      const bloqueioExcluir = bloqueioLocalRecebimentos(next.length);
      if (bloqueioExcluir) return { success: false, error: bloqueioExcluir };
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos(next),
        writeLocal: () => writeAll(next),
        successData: { removidos: removidos.length },
        fallbackMessage: 'Falha ao excluir recebimentos no Supabase.',
      });
      if (writeResult.success) {
        invalidateIsoProSnapshotCache();
        auditarExclusaoDefinitivaRecebimentosVarios(removidos, opcoes);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao excluir recebimentos no Supabase.' };
    }
  }

  const items = readAll();
  const removidos = items.filter((item) => idSet.has(item.id));
  if (removidos.length !== unique.length) {
    return { success: false, error: 'Alguns recebimentos nao foram encontrados.' };
  }
  const bloqueados = removidos.filter((r) => !statusPermiteExclusaoDefinitivaRecebimento(r.status));
  if (bloqueados.length) {
    return {
      success: false,
      error:
        'Exclusao definitiva so e permitida para recebimentos em aguardando conferencia, cancelados ou rascunho. Retire da selecao os que ja foram conferidos (parcial ou total) ou estao divergentes.',
    };
  }
  const next = items.filter((item) => !idSet.has(item.id));
  writeAll(next);
  invalidateIsoProSnapshotCache();
  auditarExclusaoDefinitivaRecebimentosVarios(removidos, opcoes);
  return {
    success: true,
    data: { removidos: removidos.length },
    meta: { source: 'local' as const },
  };
}

export async function excluirRecebimentoDefinitivamente(
  id: string,
  opcoes?: ExcluirRecebimentoDefinitivamenteOpcoes,
): Promise<ServiceResult<{ removido: true }>> {
  const r = await excluirRecebimentosDefinitivamente([id], opcoes);
  if (!r.success || !r.data) {
    return { success: false, error: r.error, meta: r.meta };
  }
  return { success: true, data: { removido: true }, meta: r.meta };
}

export async function buscarRecebimentoPorId(id: string): Promise<ServiceResult<Recebimento>> {
  const item = (await loadRecebimentos()).find((recebimento) => recebimento.id === id);
  if (!item) return { success: false, error: 'Recebimento nao encontrado.' };
  return { success: true, data: item };
}

export async function finalizarConferenciaRecebimento(payload: {
  id: string;
  conferente: string;
  observacoes: string;
  itens: Array<{ id: string; quantidadeConferida: number }>;
}): Promise<ServiceResult<Recebimento>> {
  const items = await loadRecebimentos();
  const index = items.findIndex((item) => item.id === payload.id);
  if (index === -1) return { success: false, error: 'Recebimento nao encontrado.' };

  const current = items[index];
  if (current.modoRecebimento !== 'aguardando_conferencia') {
    return { success: false, error: 'Este recebimento nao esta no fluxo de conferencia.' };
  }
  if (current.status === 'cancelado') {
    return { success: false, error: 'Nao e possivel conferir um recebimento cancelado.' };
  }
  const validationError = validateConferenciaPayload(current, payload);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const updatesByItemId = new Map(payload.itens.map((entry) => [entry.id, entry]));

  const nextItens = current.itens.map((item) => {
    const update = updatesByItemId.get(item.id);
    const quantidadeConferida = Math.max(0, Number(update?.quantidadeConferida ?? item.quantidadeConferida ?? 0));
    return {
      ...item,
      quantidadeConferida,
    };
  });

  const updated: Recebimento = {
    ...current,
    /** Mantém o fluxo «aguardando conferência» no histórico; o status operacional passa a `conferido`. */
    modoRecebimento: 'aguardando_conferencia',
    dataConferencia: current.dataConferencia?.trim() || new Date().toISOString(),
    conferente: payload.conferente.trim(),
    observacoes: payload.observacoes.trim(),
    itens: nextItens,
    status: deriveConferenciaStatus(nextItens),
  };

  items[index] = updated;

  if (hasSupabaseConfig()) {
    const bloqueioConferencia = bloqueioLocalRecebimentos(items.length);
    if (bloqueioConferencia) return { success: false, error: bloqueioConferencia };
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () => writeSnapshotRecebimentos(items),
      writeLocal: () => writeAll(items),
      successData: updated,
      fallbackMessage: 'Falha ao finalizar conferencia no Supabase.',
    });
  }
  writeAll(items);
  return { success: true, data: updated, meta: { source: 'local' } };
}

async function carregarTodosRecebimentosOrdenados(): Promise<ServiceResult<Recebimento[]>> {
  const fallback = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotRecebimentos(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar recebimentos no Supabase.',
  });
  const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(fallback.data);
  const items = aplicarFiltrosListaRecebimentos(enriched, {
    busca: '',
    status: 'todos',
    modo: 'todos',
  });
  return { success: true, data: items, meta: fallback.meta };
}

function chaveNegocioRecebimentoForm(form: RecebimentoFormData): string {
  return `${normalizeLookupValue(form.fornecedor)}|${form.dataRecebimento.trim()}|${normalizeLookupValue(form.notaFiscal)}|${normalizeLookupValue(form.romaneio)}`;
}

function extrairListaRecebimentosDoImport(
  parsed: unknown,
): { ok: true; list: unknown[] } | { ok: false; error: string } {
  const list = parseRecebimentosImportJsonRoot(parsed);
  if (list === null) {
    return {
      ok: false,
      error: 'Formato invalido: use um array de recebimentos ou um objeto com a propriedade "recebimentos".',
    };
  }
  return { ok: true, list };
}

function coletarNomesFornecedoresDaListaImportRecebimentos(list: unknown[]): string[] {
  const set = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const f = String(o.fornecedor ?? o.fornecedorNome ?? '').trim();
    if (f) set.add(f);
  }
  return [...set];
}

function coletarCodigosMateriaisDaListaImportRecebimentos(list: unknown[]): string[] {
  const set = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const itens = Array.isArray(o.itens) ? o.itens : [];
    for (const it of itens) {
      if (!it || typeof it !== 'object') continue;
      const row = it as Record<string, unknown>;
      const c = extrairCodigoMaterialDeObjetoImport(row);
      if (c) set.add(c);
    }
  }
  return [...set];
}

function normalizarItemImportacaoRecebimento(raw: unknown, recIndex: number, itemIndex: number): RecebimentoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const codigoMaterial = extrairCodigoMaterialDeObjetoImport(o);
  const descricaoMaterial = String(o.descricaoMaterial ?? o.descricao ?? '').trim();
  const unidade = String(o.unidade ?? 'UN').trim() || 'UN';
  const disciplina = String(o.disciplina ?? '').trim();
  const localizacao = String(o.localizacao ?? '').trim();
  const quantidadeRecebida = coerceRecebimentoQuantidade(o.quantidadeRecebida ?? o.quantidade ?? 0);
  const quantidadeConferida = coerceRecebimentoQuantidade(o.quantidadeConferida ?? 0);
  const pesoUnitario = coerceRecebimentoQuantidade(o.pesoUnitario ?? o.peso_unitario ?? 0);
  const pesoTotal = coerceRecebimentoQuantidade(o.pesoTotal ?? o.peso_total ?? 0);
  const certificado = String(o.certificado ?? o.cert ?? '').trim();
  const observacaoItem = String(o.observacaoItem ?? o.observacao_item ?? '').trim();
  const id = String(o.id ?? `imp-rec${recIndex}-i${itemIndex}`).trim();
  if (!codigoMaterial || !descricaoMaterial || !localizacao) return null;
  return normalizarItemPeso({
    id,
    codigoMaterial,
    descricaoMaterial,
    unidade,
    disciplina,
    localizacao,
    quantidadeRecebida,
    quantidadeConferida: Math.max(0, quantidadeConferida),
    pesoUnitario,
    pesoTotal,
    certificado,
    observacaoItem,
  });
}

function normalizarRecebimentoImportacao(
  raw: unknown,
  index: number,
):
  | { ok: false; message: string }
  | { ok: true; form: RecebimentoFormData; idSugerido?: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: `Registro ${index + 1}: esperado um objeto de recebimento.` };
  }
  const o = raw as Record<string, unknown>;
  const fornecedor = String(o.fornecedor ?? o.fornecedorNome ?? '').trim();
  const dataRecebimento = String(o.dataRecebimento ?? o.data ?? '').trim();
  const notaFiscal = String(o.notaFiscal ?? o.nota ?? '').trim();
  const romaneio = String(o.romaneio ?? '').trim();
  const conferente = String(o.conferente ?? o.conferenteNome ?? '').trim();
  const observacoes = String(o.observacoes ?? '').trim();
  const modoRaw = o.modoRecebimento;
  const modoRecebimento: RecebimentoFormData['modoRecebimento'] =
    modoRaw === 'aguardando_conferencia' ? 'aguardando_conferencia' : 'direto';
  const rawItens = Array.isArray(o.itens) ? o.itens : [];
  const itens = rawItens
    .map((item, itemIndex) => normalizarItemImportacaoRecebimento(item, index, itemIndex))
    .filter((item): item is RecebimentoItem => item !== null);

  const idRaw = o.id;
  const idSugerido =
    idRaw !== undefined && idRaw !== null && String(idRaw).trim() !== '' ? String(idRaw).trim() : undefined;

  return {
    ok: true,
    form: {
      fornecedor,
      dataRecebimento,
      notaFiscal,
      romaneio,
      conferente,
      modoRecebimento,
      observacoes,
      itens,
    },
    idSugerido,
  };
}

export type ExportacaoRecebimentosOpcoes = {
  filtroLista?: Pick<RecebimentoFiltro, 'busca' | 'status' | 'modo'>;
};

function exportacaoRecebimentosUsaFiltroRestrito(
  filtro: Pick<RecebimentoFiltro, 'busca' | 'status' | 'modo'> | undefined,
) {
  return Boolean(
    filtro && (filtro.busca.trim() !== '' || filtro.status !== 'todos' || filtro.modo !== 'todos'),
  );
}

/** Separador `;` para abrir corretamente no Excel em portugues (list separator regional). */
const CSV_EXCEL_SEP = ';';

function escapeCsvCellExcelPt(value: string) {
  return escapeCsvCellSemicolon(String(value));
}

export async function montarExportacaoRecebimentosJson(
  opcoes?: ExportacaoRecebimentosOpcoes,
): Promise<ServiceResult<{ json: string; fileName: string }>> {
  const loaded = await carregarTodosRecebimentosOrdenados();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar recebimentos para exportar.' };
  }
  const recebimentos = opcoes?.filtroLista
    ? aplicarFiltrosListaRecebimentos(loaded.data, opcoes.filtroLista)
    : loaded.data;
  const payload: RecebimentosArquivoExportacao = {
    schemaVersion: RECEBIMENTOS_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    recebimentos,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoRecebimentosUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-recebimentos-${stamp}${sufixo}.json`;
  return { success: true, data: { json, fileName }, meta: loaded.meta };
}

export async function montarExportacaoRecebimentosCsvResumo(
  opcoes?: ExportacaoRecebimentosOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const loaded = await carregarTodosRecebimentosOrdenados();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar recebimentos para exportar.' };
  }
  const recebimentos = opcoes?.filtroLista
    ? aplicarFiltrosListaRecebimentos(loaded.data, opcoes.filtroLista)
    : loaded.data;

  const header = [
    'fornecedor',
    'data',
    'nota_fiscal',
    'romaneio',
    'conferente',
    'modo',
    'status',
    'total_itens',
    'qtd_recebida_total',
    'qtd_conferida_total',
  ];
  const linhas = [
    header.join(CSV_EXCEL_SEP),
    ...recebimentos.map((rec) => {
      const li = toListItem(rec);
      return [
        li.fornecedor,
        li.dataRecebimento,
        li.notaFiscal,
        li.romaneio,
        li.conferente,
        li.modoRecebimento,
        li.status,
        String(li.totalItens),
        formatDecimalExcelPtBr(Number(li.quantidadeRecebidaTotal)),
        formatDecimalExcelPtBr(Number(li.quantidadeConferidaTotal)),
      ]
        .map((c) => escapeCsvCellExcelPt(c))
        .join(CSV_EXCEL_SEP);
    }),
  ];
  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoRecebimentosUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-recebimentos-resumo-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName }, meta: loaded.meta };
}

/**
 * CSV uma linha por item de material, com colunas do recebimento repetidas (mesmas chaves do import CSV).
 * Ultimas colunas: peso_unitario e peso_total (kg), alinhadas ao import.
 */
export async function montarExportacaoRecebimentosCsvItens(
  opcoes?: ExportacaoRecebimentosOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const loaded = await carregarTodosRecebimentosOrdenados();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar recebimentos para exportar.' };
  }
  const recebimentos = opcoes?.filtroLista
    ? aplicarFiltrosListaRecebimentos(loaded.data, opcoes.filtroLista)
    : loaded.data;

  const header = [
    'recebimento_id',
    'fornecedor',
    'data_recebimento',
    'nota_fiscal',
    'romaneio',
    'conferente',
    'modo_recebimento',
    'status',
    'observacoes',
    'codigo_material',
    'descricao_material',
    'unidade',
    'disciplina',
    'localizacao',
    'quantidade_recebida',
    'quantidade_conferida',
    'peso_unitario',
    'peso_total',
    'certificado',
  ];

  const linhas: string[] = [header.join(CSV_EXCEL_SEP)];

  for (const rec of recebimentos) {
    for (const it of rec.itens) {
      linhas.push(
        [
          rec.id,
          rec.fornecedor,
          rec.dataRecebimento,
          rec.notaFiscal,
          rec.romaneio,
          rec.conferente,
          rec.modoRecebimento,
          rec.status,
          rec.observacoes,
          it.codigoMaterial,
          it.descricaoMaterial,
          it.unidade,
          it.disciplina,
          it.localizacao,
          formatDecimalExcelPtBr(Number(it.quantidadeRecebida)),
          formatDecimalExcelPtBr(Number(it.quantidadeConferida)),
          formatDecimalExcelPtBr(Number(it.pesoUnitario ?? 0)),
          formatDecimalExcelPtBr(Number(it.pesoTotal ?? 0)),
          String(it.certificado ?? ''),
        ]
          .map((c) => escapeCsvCellExcelPt(c))
          .join(CSV_EXCEL_SEP),
      );
    }
  }

  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoRecebimentosUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-recebimentos-itens-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName }, meta: loaded.meta };
}

export async function importarRecebimentosDoArquivoJson(
  text: string,
): Promise<ServiceResult<RecebimentosImportacaoResumo>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { success: false, error: 'Arquivo JSON invalido ou corrompido.' };
  }

  const lista = extrairListaRecebimentosDoImport(parsed);
  if (!lista.ok) {
    return { success: false, error: lista.error };
  }
  if (!lista.list.length) {
    return { success: false, error: 'Nenhum recebimento encontrado no arquivo.' };
  }

  for (let ri = 0; ri < lista.list.length; ri++) {
    const raw = lista.list[ri];
    if (!raw || typeof raw !== 'object') {
      return {
        success: false,
        error: `Importacao nao concluida. Registro ${ri + 1}: formato invalido (esperado objeto de recebimento).`,
      };
    }
    const o = raw as Record<string, unknown>;
    const nomeFornec = String(o.fornecedor ?? o.fornecedorNome ?? '').trim();
    if (!nomeFornec) {
      return {
        success: false,
        error: `Importacao nao concluida. Registro ${ri + 1}: informe o fornecedor cadastrado em Fornecedores.`,
      };
    }
  }

  const nomesFornecedoresArquivo = coletarNomesFornecedoresDaListaImportRecebimentos(lista.list);
  const fornecedorImportErro = await validarNomesFornecedoresCadastradosAtivos(nomesFornecedoresArquivo);
  if (fornecedorImportErro) {
    return { success: false, error: fornecedorImportErro };
  }

  const mapaFornecedorCanonicoImport = new Map<string, string>();
  for (const nome of nomesFornecedoresArquivo) {
    const resolved = await resolverNomeFornecedorCadastradoAtivo(nome);
    if (resolved) {
      mapaFornecedorCanonicoImport.set(normalizeLookupValue(nome), resolved);
    }
  }

  const codigosMateriaisArquivo = coletarCodigosMateriaisDaListaImportRecebimentos(lista.list);
  const materialImportErro = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
    codigosMateriaisArquivo,
    'import',
  );
  if (materialImportErro) {
    return { success: false, error: materialImportErro };
  }

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const seenKeys = new Set<string>();

  let working: Recebimento[];
  try {
    working = [...(await loadRecebimentos())];
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar recebimentos antes da importacao.',
    };
  }

  const podeEditarImportRecebimentoPorChave = new Map<string, boolean>();
  for (const r of working) {
    podeEditarImportRecebimentoPorChave.set(
      chaveNegocioRecebimentoForm(r),
      r.status === 'aguardando_conferencia',
    );
  }

  let pesoPorCodigoImport = new Map<string, number>();
  try {
    pesoPorCodigoImport = await construirIndicePesoPorCodigoMaterial();
  } catch {
    pesoPorCodigoImport = new Map();
  }
  let disciplinaUnidadeImport: Map<string, { disciplina: string; unidade: string }> | null = null;
  try {
    disciplinaUnidadeImport = await construirIndiceDisciplinaUnidadePorCodigoMaterial();
  } catch {
    disciplinaUnidadeImport = null;
  }

  function aplicarCadastroNosItensImport(it: RecebimentoItem): RecebimentoItem {
    return aplicarCadastroMateriaisLinhaRecebimento(it, pesoPorCodigoImport, disciplinaUnidadeImport);
  }

  const cooperativeMerge = lista.list.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

  for (let i = 0; i < lista.list.length; i++) {
    const norm = normalizarRecebimentoImportacao(lista.list[i], i);
    if (!norm.ok) {
      detalhes.push(norm.message);
      ignorados += 1;
      continue;
    }

    const { idSugerido } = norm;
    let { form } = norm;
    const fornecedorCanonico = mapaFornecedorCanonicoImport.get(normalizeLookupValue(form.fornecedor));
    if (!fornecedorCanonico) {
      detalhes.push(`Registro ${i + 1}: fornecedor nao cadastrado no sistema.`);
      ignorados += 1;
      continue;
    }
    form = { ...form, fornecedor: fornecedorCanonico };
    const negocioKey = chaveNegocioRecebimentoForm(form);

    const validationPrecheck =
      !form.fornecedor.trim() || !form.dataRecebimento.trim() || (!form.notaFiscal.trim() && !form.romaneio.trim());
    if (validationPrecheck) {
      detalhes.push(`Registro ${i + 1}: fornecedor, data e nota ou romaneio sao obrigatorios.`);
      ignorados += 1;
      continue;
    }

    if (seenKeys.has(negocioKey)) {
      detalhes.push(
        `${form.fornecedor} (${form.dataRecebimento}): duplicado no mesmo arquivo — ${form.notaFiscal || form.romaneio} (ignorado).`,
      );
      ignorados += 1;
      continue;
    }
    seenKeys.add(negocioKey);

    const matchedIndex = working.findIndex((item) => chaveNegocioRecebimentoForm(item) === negocioKey);

    if (matchedIndex !== -1) {
      if (!podeEditarImportRecebimentoPorChave.get(negocioKey)) {
        detalhes.push(
          `${form.fornecedor}: ja existe e nao esta aguardando conferencia (apenas nesse status pode ser atualizado por importacao).`,
        );
        ignorados += 1;
        continue;
      }

      const normalizedBase = normalizeRecebimentoPayload(form);
      const normalized = {
        ...normalizedBase,
        itens: normalizedBase.itens.map(aplicarCadastroNosItensImport),
      };
      const validationError = validateRecebimentoPayload(normalized, working, working[matchedIndex].id);
      if (validationError) {
        detalhes.push(`${form.fornecedor}: ${validationError}`);
        ignorados += 1;
        continue;
      }

      const id = working[matchedIndex].id;
      working[matchedIndex] = { ...normalized, id, status: deriveStatus(normalized) };
      atualizados += 1;
      detalhes.push(`${form.fornecedor} (${form.notaFiscal || form.romaneio}): atualizado.`);
    } else {
      const normalizedBase = normalizeRecebimentoPayload(form);
      const normalized = {
        ...normalizedBase,
        itens: normalizedBase.itens.map(aplicarCadastroNosItensImport),
      };
      const validationError = validateRecebimentoPayload(normalized, working, undefined);
      if (validationError) {
        detalhes.push(`${form.fornecedor}: ${validationError}`);
        ignorados += 1;
        continue;
      }

      let newId = idSugerido && !working.some((r) => r.id === idSugerido) ? idSugerido : crypto.randomUUID();
      if (working.some((r) => r.id === newId)) {
        newId = crypto.randomUUID();
      }

      const created: Recebimento = {
        ...normalized,
        itens: normalized.itens.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
        id: newId,
        status: deriveStatus(normalized),
      };

      working.push(created);
      criados += 1;
      detalhes.push(`${form.fornecedor} (${form.notaFiscal || form.romaneio}): incluido.`);
    }

    if (cooperativeMerge) {
      await yieldCooperativeEveryRows(i);
    }
  }

  const resumo: RecebimentosImportacaoResumo = {
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
    const bloqueioImport = bloqueioLocalRecebimentos(working.length);
    if (bloqueioImport) {
      return { success: false, error: bloqueioImport, data: resumo };
    }
    const importWrite = await executeWrite({
      shouldWriteRemote: true,
      writeRemote: () => writeSnapshotRecebimentos(working),
      writeLocal: () => writeAll(working),
      successData: resumo,
      fallbackMessage: 'Falha ao importar recebimentos no Supabase.',
    });
    return importWrite;
  }

  const blockedImport = whenBusinessWriteBlockedResult<RecebimentosImportacaoResumo>();
  if (blockedImport) return blockedImport;
  writeAll(working);
  return { success: true, data: resumo, meta: { source: 'local' } };
}

/** Importacao a partir de planilha Excel (CSV): uma linha por item; converte para JSON e reutiliza a mesma regra do import JSON. */
export async function importarRecebimentosDoArquivoCsv(
  text: string,
): Promise<ServiceResult<RecebimentosImportacaoResumo>> {
  const built = await construirJsonImportacaoRecebimentosPlanoCsv(text);
  if (!built.ok) {
    return { success: false, error: built.error };
  }
  return importarRecebimentosDoArquivoJson(built.json);
}
