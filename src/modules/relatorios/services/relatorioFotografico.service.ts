import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { getErrorMessage, withLocalFallback } from '../../../lib/service-result';
import type { ServiceResult } from '../../../types/common.types';
import type { RelatorioFotograficoMeta, RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';

const LEGACY_STORAGE_KEY = 'iso-pro-relatorio-fotografico-v1';
const CATALOG_KEY = 'iso-pro-rf-catalog-v1';
const PAYLOAD_KEY_PREFIX = 'iso-pro-rf-payload-v1-';
const SNAPSHOT_ID = 'default';
const MAX_FOTOS = 80;
const SEQ_NUM_RF_KEY = 'iso-pro-relatorio-fotografico-num-seq';

/** ID usado ao migrar o armazenamento antigo (um único blob). */
export const LEGACY_REPORT_ID = 'rf-default';

function payloadStorageKey(id: string): string {
  return `${PAYLOAD_KEY_PREFIX}${id}`;
}

export function createEmptyRelatorioFotograficoPayload(): RelatorioFotograficoPayload {
  return {
    version: 1,
    reportId: '',
    salvoEm: new Date(0).toISOString(),
    numeroRelatorio: '',
    titulo: '',
    observacoes: '',
    rirCodigo: '',
    recebimentoId: '',
    recebimentoLabel: '',
    notaFiscal: '',
    fornecedor: '',
    romaneio: '',
    centroCusto: '',
    projeto: '',
    localObra: '',
    incluirLogoImpressao: true,
    fotos: [],
    relatoriosGerados: 0,
  };
}

/** Garante um número de relatório único (RF-ANO-NNNNN) quando ainda vazio. */
export function ensureNumeroRelatorioFotografico(p: RelatorioFotograficoPayload): RelatorioFotograficoPayload {
  if (p.numeroRelatorio.trim()) return p;
  return { ...p, numeroRelatorio: nextNumeroRelatorioFotografico() };
}

function nextNumeroRelatorioFotografico(): string {
  const year = String(new Date().getFullYear());
  if (typeof window === 'undefined') {
    return `RF-${year}-00001`;
  }
  try {
    const raw = window.localStorage.getItem(SEQ_NUM_RF_KEY);
    const o = raw ? (JSON.parse(raw) as { year?: string; n?: number }) : {};
    const sameYear = o.year === year;
    const n = sameYear && typeof o.n === 'number' ? o.n + 1 : 1;
    window.localStorage.setItem(SEQ_NUM_RF_KEY, JSON.stringify({ year, n }));
    return `RF-${year}-${String(n).padStart(5, '0')}`;
  } catch {
    return `RF-${year}-${String(Date.now() % 100000).padStart(5, '0')}`;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Normaliza JSON vindo do armazenamento (local ou Supabase). */
export function normalizeRelatorioFotograficoPayload(raw: unknown): RelatorioFotograficoPayload {
  const base = createEmptyRelatorioFotograficoPayload();
  if (!isRecord(raw)) return base;

  const version = raw.version === 1 ? 1 : 1;
  const fotosIn = Array.isArray(raw.fotos) ? raw.fotos : [];
  const fotos: RelatorioFotograficoPayload['fotos'] = [];

  for (const item of fotosIn) {
    if (!isRecord(item)) continue;
    const id = String(item.id ?? '').trim();
    const dataUrl = String(item.dataUrl ?? '').trim();
    if (!id || !dataUrl.startsWith('data:image/')) continue;
    fotos.push({
      id,
      dataUrl,
      legenda: String(item.legenda ?? '').slice(0, 2000),
      createdAt: String(item.createdAt ?? new Date().toISOString()),
      mostrarLegendaImpressao: item.mostrarLegendaImpressao === false ? false : true,
    });
    if (fotos.length >= MAX_FOTOS) break;
  }

  const reportIdRaw = String(raw.reportId ?? '').trim().slice(0, 80);

  return {
    version,
    reportId: reportIdRaw,
    salvoEm: String(raw.salvoEm ?? base.salvoEm),
    numeroRelatorio: String(raw.numeroRelatorio ?? '').slice(0, 40),
    titulo: String(raw.titulo ?? '').slice(0, 500),
    observacoes: String(raw.observacoes ?? '').slice(0, 8000),
    rirCodigo: String(raw.rirCodigo ?? '').slice(0, 120),
    recebimentoId: String(raw.recebimentoId ?? '').slice(0, 80),
    recebimentoLabel: String(raw.recebimentoLabel ?? '').slice(0, 500),
    notaFiscal: String(raw.notaFiscal ?? '').slice(0, 120),
    fornecedor: String(raw.fornecedor ?? '').slice(0, 300),
    romaneio: String(raw.romaneio ?? '').slice(0, 120),
    centroCusto: String(raw.centroCusto ?? '').slice(0, 300),
    projeto: String(raw.projeto ?? '').slice(0, 300),
    localObra: String(raw.localObra ?? '').slice(0, 300),
    incluirLogoImpressao: raw.incluirLogoImpressao === false ? false : true,
    fotos,
    relatoriosGerados: Math.max(0, Math.floor(Number(raw.relatoriosGerados) || 0)),
  };
}

/** Lê o catálogo sem disparar migração (evita recursão durante migrateLegacyIfNeeded). */
function readCatalogIdsOnly(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(CATALOG_KEY);
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as { ids?: string[] };
    return Array.isArray(o.ids) ? o.ids : [];
  } catch {
    return [];
  }
}

/** Migra o blob único antigo para o catálogo + chave por ID. */
function migrateLegacyIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return;
  try {
    const p = normalizeRelatorioFotograficoPayload(JSON.parse(legacy) as unknown);
    const id = p.reportId.trim() || LEGACY_REPORT_ID;
    const withId = normalizeRelatorioFotograficoPayload({ ...p, reportId: id });
    window.localStorage.setItem(payloadStorageKey(id), JSON.stringify(withId));
    const ids = readCatalogIdsOnly();
    if (!ids.includes(id)) {
      window.localStorage.setItem(CATALOG_KEY, JSON.stringify({ version: 1, ids: [id, ...ids] }));
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readCatalogIdsRaw(): string[] {
  if (typeof window === 'undefined') return [];
  migrateLegacyIfNeeded();
  const raw = window.localStorage.getItem(CATALOG_KEY);
  if (!raw) return [];
  try {
    const o = JSON.parse(raw) as { ids?: string[] };
    return Array.isArray(o.ids) ? o.ids : [];
  } catch {
    return [];
  }
}

function writeCatalogIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CATALOG_KEY, JSON.stringify({ version: 1, ids }));
}

/** Move o id para o início (mais recente). */
function touchCatalog(id: string): void {
  const ids = readCatalogIdsRaw().filter((x) => x !== id);
  writeCatalogIds([id, ...ids]);
}

function readPayloadFromKey(id: string): RelatorioFotograficoPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(payloadStorageKey(id));
    if (!raw) return null;
    return normalizeRelatorioFotograficoPayload(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writePayloadToStorage(payload: RelatorioFotograficoPayload): void {
  if (typeof window === 'undefined') return;
  const id = payload.reportId.trim();
  if (!id) throw new Error('reportId obrigatorio para gravar.');
  const next = normalizeRelatorioFotograficoPayload({ ...payload, reportId: id });
  const json = JSON.stringify(next);
  try {
    window.localStorage.setItem(payloadStorageKey(id), json);
    touchCatalog(id);
  } catch (e) {
    const msg =
      e instanceof DOMException && e.name === 'QuotaExceededError' ? 'Armazenamento local cheio.' : 'Falha ao gravar no navegador.';
    throw new Error(`${msg} Remova fotos ou libere espaco.`);
  }
}

function readLocalForReport(reportId: string): RelatorioFotograficoPayload | null {
  return readPayloadFromKey(reportId);
}

function newerPayload(a: RelatorioFotograficoPayload, b: RelatorioFotograficoPayload): RelatorioFotograficoPayload {
  const ta = Date.parse(a.salvoEm) || 0;
  const tb = Date.parse(b.salvoEm) || 0;
  return tb >= ta ? b : a;
}

/** Remoto e local referem-se ao mesmo relatório (evita misturar fotos de outro id). */
function remoteMatchesReport(remote: RelatorioFotograficoPayload, reportId: string): boolean {
  const rid = remote.reportId.trim();
  if (rid === reportId) return true;
  if (!rid && reportId === LEGACY_REPORT_ID) return true;
  return false;
}

async function readRemotePayload(): Promise<RelatorioFotograficoPayload> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase nao configurado.');
  const { data, error } = await supabase
    .from('iso_pro_relatorio_snapshot')
    .select('payload')
    .eq('id', SNAPSHOT_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeRelatorioFotograficoPayload(data?.payload);
}

async function writeRemotePayload(payload: RelatorioFotograficoPayload): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase nao configurado.');
  const { error } = await supabase.from('iso_pro_relatorio_snapshot').upsert(
    {
      id: SNAPSHOT_ID,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
}

/**
 * Lista relatórios guardados (metadados).
 */
export function listarMetadadosRelatoriosFotograficos(): RelatorioFotograficoMeta[] {
  const ids = readCatalogIdsRaw();
  const out: RelatorioFotograficoMeta[] = [];
  for (const id of ids) {
    const p = readPayloadFromKey(id);
    if (!p) continue;
    out.push({
      id: p.reportId || id,
      titulo: p.titulo.trim() || '(sem título)',
      numeroRelatorio: p.numeroRelatorio.trim(),
      salvoEm: p.salvoEm,
      fotoCount: p.fotos.length,
    });
  }
  return out;
}

/**
 * Remove um relatório do armazenamento local e do catálogo.
 */
export function excluirRelatorioFotograficoLocal(reportId: string): ServiceResult<void> {
  const id = reportId.trim();
  if (!id) return { success: false, error: 'ID invalido.' };
  if (typeof window === 'undefined') return { success: false, error: 'Ambiente invalido.' };
  try {
    window.localStorage.removeItem(payloadStorageKey(id));
    const ids = readCatalogIdsRaw().filter((x) => x !== id);
    writeCatalogIds(ids);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Falha ao excluir.') };
  }
}

export async function carregarRelatorioFotografico(
  reportId?: string,
): Promise<ServiceResult<RelatorioFotograficoPayload>> {
  migrateLegacyIfNeeded();
  const catalog = readCatalogIdsRaw();
  const targetId = reportId?.trim() || catalog[0] || '';

  if (!targetId) {
    const empty = createEmptyRelatorioFotograficoPayload();
    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return {
      success: true,
      data: { ...empty, reportId: newId },
      meta: { source: 'local' },
    };
  }

  let local = readLocalForReport(targetId);
  if (!local) {
    local = { ...createEmptyRelatorioFotograficoPayload(), reportId: targetId };
  }

  if (!hasSupabaseConfig()) {
    return { success: true, data: local, meta: { source: 'local' } };
  }

  const fallback = await withLocalFallback({
    shouldTryRemote: true,
    loadRemote: async () => {
      const remote = await readRemotePayload();
      if (!remoteMatchesReport(remote, targetId)) {
        return local;
      }
      const merged = newerPayload(local, remote);
      try {
        writePayloadToStorage(merged);
      } catch {
        /* mantém em memória */
      }
      return merged;
    },
    loadLocal: async () => local,
    fallbackMessage: 'Falha ao carregar relatorio fotografico na nuvem.',
  });

  return {
    success: true,
    data: fallback.data,
    meta: fallback.meta,
  };
}

export async function salvarRelatorioFotografico(
  payload: RelatorioFotograficoPayload,
): Promise<ServiceResult<RelatorioFotograficoPayload>> {
  const id = payload.reportId.trim();
  if (!id) {
    return { success: false, error: 'Identificador do relatório em falta. Recarregue a página.' };
  }

  const next: RelatorioFotograficoPayload = {
    ...ensureNumeroRelatorioFotografico(normalizeRelatorioFotograficoPayload(payload)),
    salvoEm: new Date().toISOString(),
  };

  if (!hasSupabaseConfig()) {
    try {
      writePayloadToStorage(next);
      return { success: true, data: next, meta: { source: 'local' } };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error, 'Falha ao gravar.'),
      };
    }
  }

  try {
    await writeRemotePayload(next);
    writePayloadToStorage(next);
    return { success: true, data: next, meta: { source: 'supabase' } };
  } catch (error) {
    try {
      writePayloadToStorage(next);
      return {
        success: true,
        data: next,
        meta: {
          source: 'local',
          fallbackReason: getErrorMessage(error, 'Falha ao gravar na nuvem.'),
        },
      };
    } catch (localErr) {
      return {
        success: false,
        error: getErrorMessage(localErr, 'Falha ao gravar.'),
      };
    }
  }
}

/** Grava só no armazenamento local (rápido) — útil após remover fotos. */
export function salvarRelatorioFotograficoLocalApenas(payload: RelatorioFotograficoPayload): ServiceResult<RelatorioFotograficoPayload> {
  const id = payload.reportId.trim();
  if (!id) return { success: false, error: 'Identificador do relatório em falta.' };
  const next: RelatorioFotograficoPayload = {
    ...normalizeRelatorioFotograficoPayload(payload),
    salvoEm: new Date().toISOString(),
  };
  try {
    writePayloadToStorage(next);
    return { success: true, data: next, meta: { source: 'local' } };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Falha ao gravar.') };
  }
}

/** Incrementa contador após gerar relatório impresso e persiste. */
export async function registrarRelatorioFotograficoGerado(
  payload: RelatorioFotograficoPayload,
): Promise<ServiceResult<RelatorioFotograficoPayload>> {
  const base = ensureNumeroRelatorioFotografico(normalizeRelatorioFotograficoPayload(payload));
  const next: RelatorioFotograficoPayload = {
    ...base,
    relatoriosGerados: base.relatoriosGerados + 1,
    salvoEm: new Date().toISOString(),
  };
  return salvarRelatorioFotografico(next);
}

export { MAX_FOTOS };
