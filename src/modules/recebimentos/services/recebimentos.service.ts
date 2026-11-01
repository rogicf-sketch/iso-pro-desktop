import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { parseRecebimentosImportJsonRoot } from '../../../lib/schemas/importArquivoPlano.zod';
import {
  readRemoteOrLocal,
  REMOTE_READ_TIMEOUT_HEAVY_MS,
  REMOTE_READ_TIMEOUT_MS,
  shouldTryRemoteRead,
  withRemoteReadTimeout,
} from '../../../lib/dataReadPolicy';
import { isIsoProDesktop } from '../../../lib/pdfCloud/pdfCloudConfig';
import { ensureIsoProDataSessionReadable } from '../../../lib/isoProJwtSession';
import { fetchAllExportRpcPages } from '../../../lib/exportRpcPages';
import { hasSupabaseConfig, getSupabase } from '../../../lib/supabase';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import {
  listRecebimentosIdsFromCloud,
  listRecebimentosPageFromCloud,
  readRecebimentoFromCloud,
  upsertRecebimentosEmLotes,
  writeRecebimentosSotOnCloud,
  type RecebimentoListWire,
  type RecebimentoWire,
} from '../../../lib/recebimentosTabelas';
import {
  invalidateIsoProSnapshotCache,
  isIsoProSnapshotConflictError,
  readIsoProSnapshotCursor,
} from '../../../lib/isoProSnapshot';
import { assertNoSilentSotFallback } from '../../../lib/sotWriteGuard';
import { readSnapshotRemoteSliceOrFull } from '../../../lib/snapshotSliceRead';
import { registrarAtividadeBackupOracle } from '../../../lib/backupOracleAuto.client';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { extrairCodigoMaterialDeObjetoImport } from '../../../lib/codigoMaterialImport';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { invalidateSnapshotDerivedCaches } from '../../../lib/snapshotDerivedCache';
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
import { recebimentoCorrespondeBuscaInteligente, textoRecebimentoExpandidoParaBusca } from '../utils/recebimentoBusca';
import { dedupeRecebimentosPorChaveNegocio } from '../utils/recebimentosDedupe';
import { textoModoRecebimentoListagem } from '../utils/modoRecebimentoExibicao';
import {
  construirIndiceDisciplinaUnidadePorCodigoMaterial,
  construirIndicePesoPorCodigoMaterial,
  validarCodigosMateriaisAtivosNoCadastroParaRecebimento,
} from '../../materiais/services/materiais.service';
import {
  loadFornecedoresAtivosParaValidacaoRecebimento,
  resolverNomeFornecedorCadastradoAtivo,
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
  // Limpa seed demo residual antes de contar (o guarda le o localStorage em cru).
  if (hasSupabaseConfig()) {
    const raw = localStorage.getItem(recebimentosStorageKey());
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        const validated = parseRecebimentosPersistidos(parsed);
        if (validated && isSomenteSeedDemoRecebimentos(validated)) {
          localStorage.removeItem(recebimentosStorageKey());
        }
      } catch {
        /* ignora */
      }
    }
  }
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

const DEMO_RECEBIMENTO_IDS = new Set(seedData.map((r) => r.id));

function isSomenteSeedDemoRecebimentos(items: Recebimento[]): boolean {
  return items.length > 0 && items.every((r) => DEMO_RECEBIMENTO_IDS.has(r.id));
}

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

/** Duplicata nas tabelas SoT — sem baixar o catalogo completo. */
async function existeRecebimentoDuplicadoNasTabelas(
  payload: RecebimentoFormData,
  currentId?: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const tenantId = getActiveTenantId();
  let q = supabase
    .from('iso_pro_recebimentos')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('fornecedor', payload.fornecedor.trim())
    .eq('data_recebimento', payload.dataRecebimento)
    .ilike('nota_fiscal', payload.notaFiscal.trim())
    .ilike('romaneio', payload.romaneio.trim())
    .limit(5);
  if (currentId) q = q.neq('id', currentId);
  const { data, error } = await q;
  if (error) return false;
  return (data ?? []).length > 0;
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
  const [pesoPorCodigo, disciplinaUnidadePorCodigo] = await Promise.all([
    construirIndicePesoPorCodigoMaterial().catch(() => new Map<string, number>()),
    construirIndiceDisciplinaUnidadePorCodigoMaterial().catch(() => null),
  ]);
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
  const [pesoPorCodigo, disciplinaUnidadePorCodigo] = await Promise.all([
    construirIndicePesoPorCodigoMaterial().catch(() => new Map<string, number>()),
    construirIndiceDisciplinaUnidadePorCodigoMaterial().catch(() => null),
  ]);
  return itens.map((item) => aplicarCadastroMateriaisLinhaRecebimento(item, pesoPorCodigo, disciplinaUnidadePorCodigo));
}

function normalizarRecebimentoItensLegado(rec: Recebimento): Recebimento {
  return { ...rec, itens: rec.itens.map(normalizarItemPeso) };
}

function readAll(): Recebimento[] {
  const raw = localStorage.getItem(recebimentosStorageKey());
  if (!raw) {
    // Com Supabase: empresa nova comeca vazia — nao injectar demo (bloqueava o 1.o cadastro).
    if (hasSupabaseConfig()) return [];
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
    if (hasSupabaseConfig() && isSomenteSeedDemoRecebimentos(validated)) {
      localStorage.removeItem(recebimentosStorageKey());
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
  invalidateSnapshotDerivedCaches();
}

function mergeRecebimentosLocalComNuvem(local: Recebimento[], remote: Recebimento[]): Recebimento[] {
  const byId = new Map<string, Recebimento>();
  for (const rec of local) byId.set(rec.id, rec);
  for (const rec of remote) byId.set(rec.id, rec);
  return dedupeRecebimentosPorChaveNegocio(Array.from(byId.values()));
}

let inflightDesktopRecebimentosMerge: Promise<'ok' | 'skip' | 'fail'> | null = null;

/** Desktop: espelha snapshot Supabase; nuvem e SoT quando tem dados (evita ressuscitar so-PC). */
async function mesclarRecebimentosDesktopComNuvem(): Promise<'ok' | 'skip' | 'fail'> {
  if (!hasSupabaseConfig() || !isIsoProDesktop()) return 'skip';
  if (inflightDesktopRecebimentosMerge) return inflightDesktopRecebimentosMerge;

  inflightDesktopRecebimentosMerge = (async () => {
    try {
      invalidateIsoProSnapshotCache();
      const remote = await withRemoteReadTimeout(() => readSnapshotRecebimentos());
      const local = readAll();
      if (remote.length > 0) {
        // Remote vence por id; linhas so-locais so entram se nao colidem por chave de negocio.
        writeAll(mergeRecebimentosLocalComNuvem([], remote));
      } else if (local.length > 0) {
        writeAll(dedupeRecebimentosPorChaveNegocio(local));
      }
      return 'ok';
    } catch {
      return 'fail';
    } finally {
      inflightDesktopRecebimentosMerge = null;
    }
  })();

  return inflightDesktopRecebimentosMerge;
}

/** Leitura operacional: sync desktop + dedupe por NF/fornecedor/romaneio. */
async function carregarRecebimentosBaseParaLeitura(): Promise<{
  data: Recebimento[];
  meta: NonNullable<ServiceResult<Recebimento[]>['meta']>;
}> {
  if (hasSupabaseConfig() && isIsoProDesktop()) {
    const merged = await mesclarRecebimentosDesktopComNuvem();
    const data = dedupeRecebimentosPorChaveNegocio(readAll());
    return {
      data,
      meta: {
        source: merged === 'ok' ? 'supabase' : 'local',
        ...(merged === 'fail'
          ? { fallbackReason: 'Nao foi possivel sincronizar recebimentos com a nuvem; exportacao pode estar desatualizada.' }
          : {}),
      },
    };
  }

  const fallback = await withLocalFallback({
    shouldTryRemote: shouldTryRemoteRead(),
    loadRemote: async () => {
      invalidateIsoProSnapshotCache();
      return dedupeRecebimentosPorChaveNegocio(await readSnapshotRecebimentos());
    },
    loadLocal: () => dedupeRecebimentosPorChaveNegocio(readAll()),
    // Sem corrida de 450ms: esta leitura alimenta metricas/localizacoes do planejamento e
    // conciliacoes. Num browser novo a copia local esta vazia — servir local "por rapidez"
    // fazia a folha de campo mostrar "—" nas localizacoes (18/07/2026).
    preferMs: REMOTE_READ_TIMEOUT_MS,
    fallbackMessage: 'Falha ao consultar recebimentos no Supabase.',
  });
  return { data: fallback.data, meta: fallback.meta };
}

async function loadRecebimentos(): Promise<Recebimento[]> {
  const { data } = await carregarRecebimentosBaseParaLeitura();
  return enriquecerRecebimentosComPesoCadastroMateriais(data);
}

/** Carrega todos os recebimentos (Supabase com fallback local) — usado no planejamento de documentos. */
export async function carregarRecebimentosCompletos(opcoes?: {
  /** Status do desenho só precisa de quantidade/código. Não baixa o cadastro inteiro de materiais. */
  semCadastroMateriais?: boolean;
}): Promise<Recebimento[]> {
  const { data } = await carregarRecebimentosBaseParaLeitura();
  if (opcoes?.semCadastroMateriais) return data;
  return enriquecerRecebimentosComPesoCadastroMateriais(data);
}

/**
 * Indice leve id -> texto de NF/romaneio/fornecedor para busca cruzada (ex.: historico de etiquetas).
 * Nao enriquece itens nem consulta cadastro de materiais.
 */
export async function carregarIndiceTextoBuscaRecebimentos(
  referenciaIds?: Iterable<string>,
): Promise<Map<string, string>> {
  const { data } = await carregarRecebimentosBaseParaLeitura();
  const idSet = referenciaIds ? new Set(referenciaIds) : null;
  const map = new Map<string, string>();
  for (const r of data) {
    if (idSet && !idSet.has(r.id)) continue;
    map.set(r.id, textoRecebimentoExpandidoParaBusca(r));
  }
  return map;
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
  const payload = await readSnapshotRemoteSliceOrFull<SnapshotPayload>(['recebimentos']);
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

type SnapshotRecebimentoRecord = NonNullable<SnapshotPayload['recebimentos']>[number];

function recebimentoToSnapshotRecord(item: Recebimento): SnapshotRecebimentoRecord {
  return {
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
  };
}

export type SnapshotRecebimentosWrite =
  | { upsert: Recebimento[] }
  | { replaceAll: Recebimento[] }
  | { removeIds: string[] };

/**
 * SoT table-first: `iso_pro_write_recebimentos_sot` (tabelas + projecao snapshot).
 * Sem fallback patch_snapshot (hard-fail sot_require_rpc).
 */
const RECEBIMENTOS_IMPORT_UPSERT_CHUNK = 40;

async function writeSnapshotRecebimentos(write: SnapshotRecebimentosWrite): Promise<void> {
  if ('upsert' in write && write.upsert.length > RECEBIMENTOS_IMPORT_UPSERT_CHUNK) {
    const codigos = write.upsert.flatMap((r) => r.itens.map((it) => it.codigoMaterial));
    for (let i = 0; i < write.upsert.length; i += RECEBIMENTOS_IMPORT_UPSERT_CHUNK) {
      await writeSnapshotRecebimentosChunk({
        upsert: write.upsert.slice(i, i + RECEBIMENTOS_IMPORT_UPSERT_CHUNK),
      });
    }
    await alinharPlanejamentoAposNf(codigos);
    return;
  }
  await writeSnapshotRecebimentosChunk(write);
  if ('upsert' in write) {
    await alinharPlanejamentoAposNf(write.upsert.flatMap((r) => r.itens.map((it) => it.codigoMaterial)));
  } else if ('replaceAll' in write) {
    await alinharPlanejamentoAposNf(write.replaceAll.flatMap((r) => r.itens.map((it) => it.codigoMaterial)));
  }
}

async function writeSnapshotRecebimentosChunk(write: SnapshotRecebimentosWrite): Promise<void> {
  const maxAttempts = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // So OCC cursor — nao baixar a fatia recebimentos[] inteira (todas as NFs + itens).
      const baselineUpdatedAt = await readIsoProSnapshotCursor();
      const sot = await writeRecebimentosSotOnCloud({
        baselineUpdatedAt,
        upsert: 'upsert' in write ? write.upsert.map(recebimentoToSnapshotRecord) : null,
        removeIds: 'removeIds' in write ? write.removeIds : null,
        replaceAll: 'replaceAll' in write ? write.replaceAll.map(recebimentoToSnapshotRecord) : null,
      });
      assertNoSilentSotFallback('recebimentos', sot.missing);
      invalidateIsoProSnapshotCache();
      registrarAtividadeBackupOracle('recebimento');
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

  throw lastError instanceof Error ? lastError : new Error('Falha ao gravar recebimentos na nuvem.');
}

/** Depois da NF: cache do Excel e coluna status da lista, no mesmo criterio da linha. */
async function alinharPlanejamentoAposNf(codigos: string[]): Promise<void> {
  const unique = [...new Set(codigos.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length || !hasSupabaseConfig()) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const tenant = getActiveTenantId();
  const esperar = <T,>(promise: PromiseLike<T>) =>
    Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), 120_000);
      }),
    ]);
  await esperar(supabase.rpc('iso_pro_refresh_qty_recebida_por_codigo', { p_tenant_id: tenant }));
  await esperar(
    supabase.rpc('iso_pro_alinhar_status_documentos_por_codigos', {
      p_tenant_id: tenant,
      p_codigos: unique,
    }),
  );
  void supabase.rpc('iso_pro_refresh_metricas_planejamento_cache', { p_tenant_id: tenant });
}

function mapListWireToListItem(row: RecebimentoListWire): RecebimentoListItem {
  const statusRaw = String(row.status ?? 'aguardando_conferencia');
  const status = (
    [
      'rascunho',
      'aguardando_conferencia',
      'conferido',
      'parcialmente_conferido',
      'divergente',
      'cancelado',
    ].includes(statusRaw)
      ? statusRaw
      : 'aguardando_conferencia'
  ) as Recebimento['status'];
  const modoRaw = String(row.modoRecebimento ?? 'direto');
  const modoRecebimento = (
    modoRaw === 'aguardando_conferencia' ? 'aguardando_conferencia' : 'direto'
  ) as Recebimento['modoRecebimento'];
  return {
    id: String(row.id ?? ''),
    fornecedor: String(row.fornecedor ?? ''),
    dataRecebimento: String(row.dataRecebimento ?? ''),
    notaFiscal: String(row.notaFiscal ?? ''),
    romaneio: String(row.romaneio ?? ''),
    conferente: String(row.conferente ?? ''),
    modoRecebimento,
    status,
    dataConferencia: row.dataConferencia ? String(row.dataConferencia) : undefined,
    totalItens: Number(row.totalItens) || 0,
    quantidadeRecebidaTotal: Number(row.quantidadeRecebidaTotal) || 0,
    quantidadeConferidaTotal: Number(row.quantidadeConferidaTotal) || 0,
    conferenciaItensDivergentes: Number(row.conferenciaItensDivergentes) || 0,
  };
}

function mapWireToRecebimento(row: RecebimentoWire): Recebimento {
  const statusRaw = String(row.status ?? 'aguardando_conferencia');
  const status = (
    [
      'rascunho',
      'aguardando_conferencia',
      'conferido',
      'parcialmente_conferido',
      'divergente',
      'cancelado',
    ].includes(statusRaw)
      ? statusRaw
      : 'aguardando_conferencia'
  ) as Recebimento['status'];
  const modoRaw = String(row.modoRecebimento ?? 'direto');
  const modoRecebimento = (
    modoRaw === 'aguardando_conferencia' ? 'aguardando_conferencia' : 'direto'
  ) as Recebimento['modoRecebimento'];
  return {
    id: String(row.id ?? ''),
    fornecedor: String(row.fornecedor ?? row.fornecedorNome ?? ''),
    dataRecebimento: String(row.dataRecebimento ?? row.data ?? ''),
    notaFiscal: String(row.notaFiscal ?? row.nota ?? ''),
    romaneio: String(row.romaneio ?? ''),
    conferente: String(row.conferente ?? row.conferenteNome ?? ''),
    modoRecebimento,
    status,
    observacoes: String(row.observacoes ?? ''),
    dataConferencia: row.dataConferencia ? String(row.dataConferencia) : undefined,
    itens: (row.itens ?? []).map((item, itemIndex) =>
      normalizarItemPeso({
        id: String(item.id ?? `${row.id}-item-${itemIndex + 1}`),
        codigoMaterial: String(item.codigoMaterial ?? item.codigo ?? ''),
        descricaoMaterial: String(item.descricaoMaterial ?? item.descricao ?? ''),
        unidade: String(item.unidade ?? 'UN'),
        disciplina: String(item.disciplina ?? ''),
        localizacao: String(item.localizacao ?? ''),
        quantidadeRecebida: coerceRecebimentoQuantidade(item.quantidadeRecebida ?? item.quantidade),
        quantidadeConferida: coerceRecebimentoQuantidade(item.quantidadeConferida),
        pesoUnitario: coerceRecebimentoQuantidade(item.pesoUnitario ?? 0),
        pesoTotal: coerceRecebimentoQuantidade(item.pesoTotal ?? 0),
        certificado: String(item.certificado ?? ''),
        observacaoItem: String(item.observacaoItem ?? '').trim(),
      }),
    ),
  };
}
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

function resumoAuditoriaRecebimento(rec: Pick<
  Recebimento,
  'id' | 'notaFiscal' | 'romaneio' | 'fornecedor' | 'status' | 'dataRecebimento' | 'modoRecebimento' | 'itens'
>) {
  return {
    id: rec.id,
    notaFiscal: rec.notaFiscal,
    romaneio: rec.romaneio,
    fornecedor: rec.fornecedor,
    status: rec.status,
    dataRecebimento: rec.dataRecebimento,
    modoRecebimento: rec.modoRecebimento,
    totalItens: rec.itens?.length ?? 0,
    itens: (rec.itens ?? []).slice(0, 40).map((it) => ({
      codigoMaterial: it.codigoMaterial,
      quantidadeRecebida: it.quantidadeRecebida,
      quantidadeConferida: it.quantidadeConferida,
    })),
  };
}

export type SalvarRecebimentoOpcoes = {
  /** Login da sessão — obrigatório para auditoria profissional (quem/quando). */
  actorLogin?: string;
};

function auditarRecebimentoCriado(rec: Recebimento, opcoes?: SalvarRecebimentoOpcoes) {
  appendAuthAuditEvent({
    type: 'recebimento_criado',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Recebimento criado ${rec.notaFiscal || '-'} / ${rec.romaneio || '-'} (${rec.fornecedor}) · ${rec.itens.length} item(ns) · status=${rec.status}`,
    entityType: 'recebimento',
    entityId: rec.id,
    after: resumoAuditoriaRecebimento(rec),
  });
}

function auditarRecebimentoEditado(
  before: Recebimento,
  after: Recebimento,
  opcoes?: SalvarRecebimentoOpcoes,
) {
  appendAuthAuditEvent({
    type: 'recebimento_editado',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Recebimento editado ${after.notaFiscal || '-'} / ${after.romaneio || '-'} (${after.fornecedor})`,
    entityType: 'recebimento',
    entityId: after.id,
    before: resumoAuditoriaRecebimento(before),
    after: resumoAuditoriaRecebimento(after),
  });
}

export type CancelarRecebimentoOpcoes = {
  actorLogin?: string;
};

function auditarRecebimentoCancelado(rec: Recebimento, opcoes?: CancelarRecebimentoOpcoes) {
  appendAuthAuditEvent({
    type: 'recebimento_cancelado',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `Recebimento cancelado ${rec.notaFiscal || '-'} / ${rec.romaneio || '-'} (${rec.fornecedor})`,
    entityType: 'recebimento',
    entityId: rec.id,
    before: resumoAuditoriaRecebimento({ ...rec, status: 'aguardando_conferencia' }),
    after: resumoAuditoriaRecebimento(rec),
  });
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
    detail: `Recebimento ${rec.notaFiscal || '-'} / ${rec.romaneio || '-'} (${rec.fornecedor}) destravado para correcao (mantem conferencia; volta a aguardar conferencia para edicao).`,
    entityType: 'recebimento',
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
    entityType: 'recebimento',
    before: {
      notaFiscal: rec.notaFiscal,
      romaneio: rec.romaneio,
      fornecedor: rec.fornecedor,
    },
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

/** Ao editar recebimento em fluxo de conferencia, recalcula status se ja existem quantidades conferidas. */
function statusEDataConferenciaAposSalvarEdicao(
  form: RecebimentoFormData,
  anterior: Recebimento,
): Pick<Recebimento, 'status' | 'dataConferencia'> {
  if (form.modoRecebimento === 'direto') {
    return { status: 'conferido', dataConferencia: anterior.dataConferencia };
  }
  const temQuantidadeConferida = form.itens.some((item) => Number(item.quantidadeConferida) > 0);
  if (!temQuantidadeConferida) {
    return { status: 'aguardando_conferencia', dataConferencia: undefined };
  }
  const status = deriveConferenciaStatus(form.itens);
  if (status === 'aguardando_conferencia') {
    return { status, dataConferencia: undefined };
  }
  return {
    status,
    dataConferencia: anterior.dataConferencia?.trim() || new Date().toISOString(),
  };
}

function montarRecebimentoAposSalvarEdicao(
  normalized: RecebimentoFormData,
  currentId: string,
  anterior: Recebimento,
): Recebimento {
  const { dataConferencia: _omitDataConferencia, ...semDataConferencia } = normalized;
  void _omitDataConferencia;
  return {
    ...semDataConferencia,
    id: currentId,
    ...statusEDataConferenciaAposSalvarEdicao(normalized, anterior),
  };
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

function listarRecebimentosLocalSync(
  filtro: RecebimentoFiltro,
): PaginatedResult<RecebimentoListItem> {
  const items = aplicarFiltrosListaRecebimentos(dedupeRecebimentosPorChaveNegocio(readAll()), filtro);
  const start = (filtro.page - 1) * filtro.pageSize;
  return {
    items: items.slice(start, start + filtro.pageSize).map(toListItem),
    total: items.length,
    page: filtro.page,
    pageSize: filtro.pageSize,
  };
}

export async function listarRecebimentos(
  filtro: RecebimentoFiltro,
): Promise<ServiceResult<PaginatedResult<RecebimentoListItem>>> {
  const localPage = listarRecebimentosLocalSync(filtro);

  // Offline / sem tentativa remota: lista local imediata.
  if (!shouldTryRemoteRead()) {
    return {
      success: true,
      data: localPage,
      meta: { source: 'local' },
    };
  }

  // A lista da nuvem e a fonte. Esperar a pagina (em geral < 2s) em vez de
  // mostrar o cache local com o rotulo «nuvem».
  if (hasSupabaseConfig()) {
    try {
      const page = await withRemoteReadTimeout(
        () =>
          listRecebimentosPageFromCloud({
            busca: filtro.busca,
            offset: (filtro.page - 1) * filtro.pageSize,
            limit: filtro.pageSize,
            status: filtro.status,
            modo: filtro.modo,
          }),
        // Busca NF/lista: 8s (RPC já tem statement_timeout 8s). Evita «A buscar…» 25s.
        filtro.busca?.trim() ? 8_000 : 12_000,
      );
      if (page.source === 'tables' && !page.error) {
        return {
          success: true,
          data: {
            items: page.recebimentos.map(mapListWireToListItem),
            total: page.total,
            page: filtro.page,
            pageSize: filtro.pageSize,
          },
          meta: { source: 'supabase' },
        };
      }
    } catch {
      /* cai no local */
    }

    return {
      success: true,
      data: localPage,
      meta: {
        source: 'local',
        staleWhileRevalidate: true,
        fallbackReason: 'Nao foi possivel actualizar a lista na nuvem.',
      },
    };
  }

  return {
    success: true,
    data: localPage,
    meta: { source: 'local' },
  };
}

/** IDs de todos os recebimentos que correspondem ao filtro (ignora paginacao). */
export async function obterIdsRecebimentosFiltrados(filtro: RecebimentoFiltro): Promise<ServiceResult<string[]>> {
  try {
    if (hasSupabaseConfig()) {
      const cloud = await listRecebimentosIdsFromCloud({
        busca: filtro.busca,
        status: filtro.status,
        modo: filtro.modo,
      });
      if (cloud.source === 'tables' && !cloud.error) {
        return { success: true, data: cloud.ids };
      }
    }
    const base = await carregarRecebimentosBaseParaLeitura();
    const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(base.data);
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
    const base = await carregarRecebimentosBaseParaLeitura();
    const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(base.data);
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
  opcoes?: SalvarRecebimentoOpcoes,
): Promise<ServiceResult<Recebimento>> {
  if (hasSupabaseConfig()) {
    try {
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

      // 100k-safe: validacao sem baixar recebimentos[] completo.
      const validationError = validateRecebimentoPayload(normalized, [], currentId);
      if (validationError) return { success: false, error: validationError };

      const dup = await existeRecebimentoDuplicadoNasTabelas(normalized, currentId);
      if (dup) {
        return {
          success: false,
          error: 'Ja existe um recebimento com o mesmo fornecedor, data, nota fiscal e romaneio.',
        };
      }

      const localItems = readAll();

      if (currentId) {
        const cloud = await readRecebimentoFromCloud(currentId);
        const existing =
          cloud.recebimento != null
            ? mapWireToRecebimento(cloud.recebimento)
            : localItems.find((item) => item.id === currentId);
        if (!existing) return { success: false, error: 'Recebimento nao encontrado.' };
        if (existing.status === 'cancelado') {
          return { success: false, error: 'Nao e possivel editar um recebimento cancelado.' };
        }
        if (existing.status !== 'aguardando_conferencia') {
          return {
            success: false,
            error: 'Recebimentos com conferencia iniciada nao podem ser editados por este fluxo.',
          };
        }
        const beforeEdit = { ...existing, itens: existing.itens.map((it) => ({ ...it })) };
        const updated = montarRecebimentoAposSalvarEdicao(normalized, currentId, existing);
        const nextLocal = localItems.some((x) => x.id === currentId)
          ? localItems.map((x) => (x.id === currentId ? updated : x))
          : [...localItems, updated];
        const bloqueioEdit = bloqueioLocalRecebimentos(nextLocal.length);
        if (bloqueioEdit) return { success: false, error: bloqueioEdit };
        const writeEdit = await executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotRecebimentos({ upsert: [updated] }),
          writeLocal: () => writeAll(nextLocal),
          successData: updated,
          fallbackMessage: 'Falha ao salvar recebimento no Supabase.',
        });
        if (writeEdit.success && writeEdit.data) {
          auditarRecebimentoEditado(beforeEdit, writeEdit.data, opcoes);
        }
        return writeEdit;
      }

      const created: Recebimento = {
        ...normalized,
        id: crypto.randomUUID(),
        status: deriveStatus(normalized),
      };
      const nextLocal = [...localItems, created];
      const bloqueioNovo = bloqueioLocalRecebimentos(nextLocal.length);
      if (bloqueioNovo) return { success: false, error: bloqueioNovo };
      const writeNew = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos({ upsert: [created] }),
        writeLocal: () => writeAll(nextLocal),
        successData: created,
        fallbackMessage: 'Falha ao salvar recebimento no Supabase.',
      });
      if (writeNew.success && writeNew.data) {
        auditarRecebimentoCriado(writeNew.data, opcoes);
      }
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
    const beforeEditLocal = { ...items[index], itens: items[index].itens.map((it) => ({ ...it })) };
    items[index] = montarRecebimentoAposSalvarEdicao(normalized, currentId, items[index]);
    writeAll(items);
    auditarRecebimentoEditado(beforeEditLocal, items[index], opcoes);
    return { success: true, data: items[index] };
  }

  const created: Recebimento = {
    ...normalized,
    id: crypto.randomUUID(),
    status: deriveStatus(normalized),
  };

  items.push(created);
  writeAll(items);
  auditarRecebimentoCriado(created, opcoes);
  return { success: true, data: created };
}

export async function cancelarRecebimento(
  id: string,
  opcoes?: CancelarRecebimentoOpcoes,
): Promise<ServiceResult<Recebimento>> {
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
      const writeCancel = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos({ upsert: [items[index]] }),
        writeLocal: () => writeAll(items),
        successData: items[index],
        fallbackMessage: 'Falha ao cancelar recebimento no Supabase.',
      });
      if (writeCancel.success && writeCancel.data) {
        auditarRecebimentoCancelado(writeCancel.data, opcoes);
      }
      return writeCancel;
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
  auditarRecebimentoCancelado(items[index], opcoes);
  return { success: true, data: items[index] };
}

/**
 * Volta o recebimento para aguardando conferencia mantendo quantidades e observacoes da conferencia ja feita,
 * para permitir correcao pontual (desktop/mobile), cancelamento ou exclusao. Senha e permissao administrar ficam na UI.
 */
export async function destravarRecebimentoParaCorrecaoAdministrativa(
  id: string,
  opcoes?: DestravarRecebimentoParaCorrecaoOpcoes,
): Promise<ServiceResult<Recebimento>> {
  const aplicarDestravamento = (items: Recebimento[], idx: number): Recebimento => {
    const atual = items[idx];
    const { dataConferencia: _omitDataConferenciaDestravar, ...base } = atual;
    void _omitDataConferenciaDestravar;
    const atualizado: Recebimento = {
      ...base,
      modoRecebimento: 'aguardando_conferencia',
      status: 'aguardando_conferencia',
      itens: atual.itens.map((it) => ({ ...it })),
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
        writeRemote: () => writeSnapshotRecebimentos({ upsert: [atualizado] }),
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
      const bloqueioExcluir = bloqueioLocalRecebimentos(items.length);
      if (bloqueioExcluir) return { success: false, error: bloqueioExcluir };
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotRecebimentos({ removeIds: unique }),
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

export async function buscarRecebimentoPorId(
  id: string,
  opcoes?: { visualizacao?: boolean },
): Promise<ServiceResult<Recebimento>> {
  if (hasSupabaseConfig()) {
    try {
      const cloud = await readRecebimentoFromCloud(id);
      if (cloud.source === 'tables' && cloud.recebimento) {
        const mapped = mapWireToRecebimento(cloud.recebimento);
        if (opcoes?.visualizacao) {
          return { success: true, data: mapped, meta: { source: 'supabase' } };
        }
        const [enriched] = await enriquecerRecebimentosComPesoCadastroMateriais([mapped]);
        return { success: true, data: enriched, meta: { source: 'supabase' } };
      }
      if (opcoes?.visualizacao) {
        return { success: false, error: cloud.error ?? 'Recebimento nao encontrado.' };
      }
    } catch {
      if (opcoes?.visualizacao) {
        return { success: false, error: 'Nao foi possivel carregar o recebimento.' };
      }
    }
  }
  const raw = await readRemoteOrLocal({
    readRemote: readSnapshotRecebimentos,
    readLocal: readAll,
  });
  const found = raw.find((recebimento) => recebimento.id === id);
  if (!found) return { success: false, error: 'Recebimento nao encontrado.' };
  const [enriched] = await enriquecerRecebimentosComPesoCadastroMateriais([found]);
  return { success: true, data: enriched };
}

export async function finalizarConferenciaRecebimento(payload: {
  id: string;
  conferente: string;
  observacoes: string;
  itens: Array<{ id: string; quantidadeConferida: number }>;
}): Promise<ServiceResult<Recebimento>> {
  const found = await buscarRecebimentoPorId(payload.id);
  if (!found.success || !found.data) {
    return { success: false, error: found.error ?? 'Recebimento nao encontrado.' };
  }
  const current = found.data;
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

  const localItems = readAll();
  const nextLocal = localItems.some((x) => x.id === updated.id)
    ? localItems.map((x) => (x.id === updated.id ? updated : x))
    : [...localItems, updated];

  const result = await executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotRecebimentos({ upsert: [updated] }),
    writeLocal: () => writeAll(nextLocal),
    successData: updated,
    fallbackMessage: 'Falha ao finalizar conferencia no Supabase.',
  });
  if (result.success) {
    appendAuthAuditEvent({
      type: 'recebimento_conferencia_finalizada',
      actorLogin: payload.conferente.trim() || 'desconhecido',
      detail: `Conferencia finalizada NF ${updated.notaFiscal || '-'} / ${updated.romaneio || '-'} (${updated.fornecedor}) status=${updated.status}.`,
      entityType: 'recebimento',
      entityId: updated.id,
      before: {
        status: current.status,
        itens: current.itens.map((i) => ({
          id: i.id,
          codigo: i.codigoMaterial,
          qtdRecebida: i.quantidadeRecebida,
          qtdConferida: i.quantidadeConferida,
        })),
      },
      after: {
        status: updated.status,
        conferente: updated.conferente,
        itens: updated.itens.map((i) => ({
          id: i.id,
          codigo: i.codigoMaterial,
          qtdRecebida: i.quantidadeRecebida,
          qtdConferida: i.quantidadeConferida,
        })),
      },
    });
  }
  return result;
}

async function carregarTodosRecebimentosOrdenados(): Promise<ServiceResult<Recebimento[]>> {
  const base = await carregarRecebimentosBaseParaLeitura();
  const enriched = await enriquecerRecebimentosComPesoCadastroMateriais(base.data);
  const items = aplicarFiltrosListaRecebimentos(enriched, {
    busca: '',
    status: 'todos',
    modo: 'todos',
  });
  return { success: true, data: items, meta: base.meta };
}

function chaveNegocioRecebimentoForm(
  form: Pick<RecebimentoFormData, 'fornecedor' | 'dataRecebimento' | 'notaFiscal' | 'romaneio'>,
): string {
  return `${normalizeLookupValue(form.fornecedor)}|${form.dataRecebimento.trim()}|${normalizeLookupValue(form.notaFiscal)}|${normalizeLookupValue(form.romaneio)}`;
}

type RecebimentoIndiceImport = Pick<
  Recebimento,
  'id' | 'fornecedor' | 'dataRecebimento' | 'notaFiscal' | 'romaneio' | 'status'
>;

/** Índice leve via lista paginada (tabelas) — evita baixar o snapshot completo só para importar 1 NF. */
async function carregarIndiceRecebimentosParaImportacao(): Promise<RecebimentoIndiceImport[]> {
  if (!hasSupabaseConfig()) {
    return (await loadRecebimentos()).map((r) => ({
      id: r.id,
      fornecedor: r.fornecedor,
      dataRecebimento: r.dataRecebimento,
      notaFiscal: r.notaFiscal,
      romaneio: r.romaneio,
      status: r.status,
    }));
  }

  const out: RecebimentoIndiceImport[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const page = await withRemoteReadTimeout(
      () => listRecebimentosPageFromCloud({ offset, limit }),
      REMOTE_READ_TIMEOUT_HEAVY_MS,
    );
    if (page.error) {
      throw new Error(
        `Nao foi possivel ler o indice de recebimentos na nuvem — importacao cancelada. Detalhe: ${page.error}`,
      );
    }
    for (const row of page.recebimentos) {
      out.push({
        id: String(row.id ?? ''),
        fornecedor: String(row.fornecedor ?? ''),
        dataRecebimento: String(row.dataRecebimento ?? ''),
        notaFiscal: String(row.notaFiscal ?? ''),
        romaneio: String(row.romaneio ?? ''),
        status: mapListWireToListItem(row).status,
      });
    }
    if (page.recebimentos.length < limit) break;
    offset += limit;
  }
  return out;
}

function mesclarDeltaRecebimentosNoLocalStorage(delta: Recebimento[]): void {
  try {
    const local = readAll();
    if (!local.length) {
      if (!hasSupabaseConfig()) writeAll(delta);
      return;
    }
    const map = new Map(local.map((r) => [chaveNegocioRecebimentoForm(r), r]));
    for (const r of delta) {
      map.set(chaveNegocioRecebimentoForm(r), r);
    }
    writeAll([...map.values()]);
  } catch {
    // A nuvem ja gravou. Falta de espaco no navegador nao pode parecer importacao interrompida.
  }
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
        textoModoRecebimentoListagem(li.modoRecebimento, li.status, li.dataConferencia),
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
  type ExportRow = {
    recebimento_id?: string;
    fornecedor?: string;
    data_recebimento?: string | null;
    nota_fiscal?: string;
    romaneio?: string;
    conferente?: string;
    modo_recebimento?: string;
    status?: string;
    data_conferencia?: string | null;
    observacoes?: string;
    codigo_material?: string;
    descricao_material?: string;
    unidade?: string;
    disciplina?: string;
    localizacao?: string;
    quantidade_recebida?: number;
    quantidade_conferida?: number;
    peso_unitario?: number;
    peso_total?: number;
    certificado?: string;
  };

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

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoRecebimentosUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-recebimentos-itens-${stamp}${sufixo}.csv`;

  const filtro = opcoes?.filtroLista;
  const filtrarRows = (rows: ExportRow[]): ExportRow[] => {
    if (!filtro) return rows;
    let next = rows;
    if (filtro.status !== 'todos') {
      next = next.filter((r) => String(r.status ?? '') === filtro.status);
    }
    if (filtro.modo !== 'todos') {
      next = next.filter((r) => String(r.modo_recebimento ?? '') === filtro.modo);
    }
    if (filtro.busca.trim()) {
      const busca = filtro.busca.trim().toLowerCase();
      next = next.filter((r) => {
        const blob = [
          r.fornecedor,
          r.nota_fiscal,
          r.romaneio,
          r.conferente,
          r.observacoes,
          r.codigo_material,
          r.descricao_material,
          r.localizacao,
          r.disciplina,
          r.certificado,
        ]
          .map((x) => String(x ?? ''))
          .join(' ')
          .toLowerCase();
        return blob.includes(busca);
      });
    }
    return next;
  };

  const montarCsvDeRows = (rows: ExportRow[]): string => {
    const linhas: string[] = [header.join(CSV_EXCEL_SEP)];
    for (const r of rows) {
      linhas.push(
        [
          String(r.recebimento_id ?? ''),
          String(r.fornecedor ?? ''),
          String(r.data_recebimento ?? ''),
          String(r.nota_fiscal ?? ''),
          String(r.romaneio ?? ''),
          String(r.conferente ?? ''),
          textoModoRecebimentoListagem(
            (String(r.modo_recebimento ?? 'direto') as Recebimento['modoRecebimento']),
            (String(r.status ?? '') as Recebimento['status']),
            r.data_conferencia ?? undefined,
          ),
          String(r.status ?? ''),
          String(r.observacoes ?? ''),
          String(r.codigo_material ?? ''),
          String(r.descricao_material ?? ''),
          String(r.unidade ?? 'UN'),
          String(r.disciplina ?? ''),
          String(r.localizacao ?? ''),
          formatDecimalExcelPtBr(Number(r.quantidade_recebida)),
          formatDecimalExcelPtBr(Number(r.quantidade_conferida)),
          formatDecimalExcelPtBr(Number(r.peso_unitario ?? 0)),
          formatDecimalExcelPtBr(Number(r.peso_total ?? 0)),
          String(r.certificado ?? ''),
        ]
          .map((c) => escapeCsvCellExcelPt(c))
          .join(CSV_EXCEL_SEP),
      );
    }
    return `\uFEFF${linhas.join('\r\n')}\r\n`;
  };

  if (hasSupabaseConfig()) {
    try {
      await ensureIsoProDataSessionReadable();
      const supabase = getSupabase();
      if (supabase) {
        const cloud = await fetchAllExportRpcPages<ExportRow>({
          supabase,
          rpcName: 'iso_pro_export_recebimentos_itens_page',
          tenantId: getActiveTenantId(),
        });
        if (!cloud.missingRpc && !cloud.error) {
          const csv = montarCsvDeRows(filtrarRows(cloud.rows));
          return { success: true, data: { csv, fileName }, meta: { source: 'supabase' } };
        }
      }
    } catch {
      /* fallback */
    }
  }

  const loaded = await carregarTodosRecebimentosOrdenados();
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Nao foi possivel carregar recebimentos para exportar.' };
  }
  const recebimentos = opcoes?.filtroLista
    ? aplicarFiltrosListaRecebimentos(loaded.data, opcoes.filtroLista)
    : loaded.data;

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
          textoModoRecebimentoListagem(rec.modoRecebimento, rec.status, rec.dataConferencia),
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
  return { success: true, data: { csv, fileName }, meta: loaded.meta };
}

export async function importarRecebimentosDoArquivoJson(
  text: string,
  opcoes?: { onProgress?: (mensagem: string) => void },
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
  const codigosMateriaisArquivo = coletarCodigosMateriaisDaListaImportRecebimentos(lista.list);

  let indice: Array<
    Pick<Recebimento, 'id' | 'fornecedor' | 'dataRecebimento' | 'notaFiscal' | 'romaneio' | 'status'>
  >;
  let mapaFornecedorCanonicoImport = new Map<string, string>();
  let pesoPorCodigoImport = new Map<string, number>();
  let disciplinaUnidadeImport: Map<string, { disciplina: string; unidade: string }> | null = null;

  try {
    const [ativos, materialImportErro, indiceNuvem, peso, disciplina] = await Promise.all([
      loadFornecedoresAtivosParaValidacaoRecebimento(),
      validarCodigosMateriaisAtivosNoCadastroParaRecebimento(codigosMateriaisArquivo, 'import'),
      carregarIndiceRecebimentosParaImportacao(),
      construirIndicePesoPorCodigoMaterial(codigosMateriaisArquivo).catch(() => new Map<string, number>()),
      construirIndiceDisciplinaUnidadePorCodigoMaterial(codigosMateriaisArquivo).catch(() => null),
    ]);
    if (materialImportErro) {
      return { success: false, error: materialImportErro };
    }
    const invalidos: string[] = [];
    for (const nome of nomesFornecedoresArquivo) {
      const raw = nome.trim();
      const found = ativos.find(
        (f) => raw.localeCompare(f.nome.trim(), 'pt-BR', { sensitivity: 'base' }) === 0,
      );
      if (!found) invalidos.push(raw);
      else mapaFornecedorCanonicoImport.set(normalizeLookupValue(raw), found.nome.trim());
    }
    if (invalidos.length) {
      const quoted = [...new Set(invalidos)].map((s) => `"${s}"`).join(', ');
      return {
        success: false,
        error: `Importacao nao concluida. Fornecedor nao cadastrado no sistema: ${quoted}. Cadastre em Fornecedores e tente novamente.`,
      };
    }
    indice = indiceNuvem;
    pesoPorCodigoImport = peso;
    disciplinaUnidadeImport = disciplina;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar recebimentos antes da importacao.',
    };
  }

  const workingValidacao: Recebimento[] = indice.map((r) => ({
    id: r.id,
    fornecedor: r.fornecedor,
    dataRecebimento: r.dataRecebimento,
    notaFiscal: r.notaFiscal,
    romaneio: r.romaneio,
    conferente: '',
    modoRecebimento: 'direto' as const,
    status: r.status,
    observacoes: '',
    itens: [],
  }));

  const podeEditarImportRecebimentoPorChave = new Map<string, boolean>();
  const indicePorChave = new Map<string, (typeof indice)[number]>();
  for (const r of indice) {
    const k = chaveNegocioRecebimentoForm(r);
    podeEditarImportRecebimentoPorChave.set(k, r.status === 'aguardando_conferencia');
    indicePorChave.set(k, r);
  }

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const seenKeys = new Set<string>();

  function aplicarCadastroNosItensImport(it: RecebimentoItem): RecebimentoItem {
    return aplicarCadastroMateriaisLinhaRecebimento(it, pesoPorCodigoImport, disciplinaUnidadeImport);
  }

  const cooperativeMerge = lista.list.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;
  const deltaPorId = new Map<string, Recebimento>();

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

    const existente = indicePorChave.get(negocioKey);

    if (existente) {
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
      const validationError = validateRecebimentoPayload(normalized, workingValidacao, existente.id);
      if (validationError) {
        detalhes.push(`${form.fornecedor}: ${validationError}`);
        ignorados += 1;
        continue;
      }

      const updated: Recebimento = { ...normalized, id: existente.id, status: deriveStatus(normalized) };
      deltaPorId.set(updated.id, updated);
      atualizados += 1;
      detalhes.push(`${form.fornecedor} (${form.notaFiscal || form.romaneio}): atualizado.`);
    } else {
      const normalizedBase = normalizeRecebimentoPayload(form);
      const normalized = {
        ...normalizedBase,
        itens: normalizedBase.itens.map(aplicarCadastroNosItensImport),
      };
      const validationError = validateRecebimentoPayload(normalized, workingValidacao, undefined);
      if (validationError) {
        detalhes.push(`${form.fornecedor}: ${validationError}`);
        ignorados += 1;
        continue;
      }

      let newId =
        idSugerido && !indice.some((r) => r.id === idSugerido) && !deltaPorId.has(idSugerido)
          ? idSugerido
          : crypto.randomUUID();
      if (indice.some((r) => r.id === newId) || deltaPorId.has(newId)) {
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

      deltaPorId.set(created.id, created);
      workingValidacao.push(created);
      indicePorChave.set(negocioKey, {
        id: created.id,
        fornecedor: created.fornecedor,
        dataRecebimento: created.dataRecebimento,
        notaFiscal: created.notaFiscal,
        romaneio: created.romaneio,
        status: created.status,
      });
      criados += 1;
      detalhes.push(`${form.fornecedor} (${form.notaFiscal || form.romaneio}): incluido.`);
    }

    if (cooperativeMerge) {
      await yieldCooperativeEveryRows(i);
    }
  }

  const delta = [...deltaPorId.values()];
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
    // Tabelas direto, em grupos de 25. Nao passa pelo snapshot (era esse envio
    // que a nuvem cortava, e a lista ja le as tabelas).
    const gravado = await upsertRecebimentosEmLotes(
      delta.map((r) => ({ ...recebimentoToSnapshotRecord(r), id: r.id }) as RecebimentoWire),
      {
        chunkSize: 25,
        onProgress: (lote, total) => opcoes?.onProgress?.(`A gravar lote ${lote} de ${total}…`),
      },
    );
    if (!gravado.ok) {
      const detalhe = (gravado.error ?? 'Falha ao gravar recebimentos.').replace(/\s+/g, ' ').slice(0, 280);
      return {
        success: false,
        error: `Importacao nao concluida. ${detalhe} Atualize a pagina e confira o total antes de importar de novo.`,
        data: { ...resumo, detalhes: resumo.detalhes.slice(0, 8) },
      };
    }
    mesclarDeltaRecebimentosNoLocalStorage(delta);
    invalidateIsoProSnapshotCache();
    opcoes?.onProgress?.('A alinhar o planejamento…');
    await alinharPlanejamentoAposNf(delta.flatMap((r) => r.itens.map((it) => it.codigoMaterial)));
    return {
      success: true,
      data: {
        ...resumo,
        detalhes: resumo.detalhes.slice(0, 8),
        mensagem: `Concluido. ${resumo.criados} novo(s) e ${resumo.atualizados} atualizado(s).`,
      },
      meta: { source: 'supabase' },
    };
  }

  const blockedImport = whenBusinessWriteBlockedResult<RecebimentosImportacaoResumo>();
  if (blockedImport) return blockedImport;
  mesclarDeltaRecebimentosNoLocalStorage(delta);
  return { success: true, data: resumo, meta: { source: 'local' } };
}

/** Importacao a partir de planilha Excel (CSV): uma linha por item; converte para JSON e reutiliza a mesma regra do import JSON. */
export async function importarRecebimentosDoArquivoCsv(
  text: string,
  opcoes?: { onProgress?: (mensagem: string) => void },
): Promise<ServiceResult<RecebimentosImportacaoResumo>> {
  opcoes?.onProgress?.('A preparar as notas…');
  const built = await construirJsonImportacaoRecebimentosPlanoCsv(text);
  if (!built.ok) {
    return { success: false, error: built.error };
  }
  return importarRecebimentosDoArquivoJson(built.json, opcoes);
}
