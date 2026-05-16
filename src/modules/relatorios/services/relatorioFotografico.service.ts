import { blobToDataUrl, dataUrlToBlob } from '../../../lib/mediaBlobCodec';
import { getScopedIsoProStorageKey, isStorageKeyForAmbienteAtivo } from '../../../lib/isoProAmbiente';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { isMediaRefKey, mediaBlobDeleteByPrefix, mediaBlobGet, mediaBlobPut, MEDIA_REF_PREFIX } from '../../../lib/mediaBlobStore';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { getErrorMessage, withLocalFallback } from '../../../lib/service-result';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import type { ServiceResult } from '../../../types/common.types';
import {
  parseRelatorioFotograficoCatalogIds,
  parseRelatorioFotograficoSeqState,
} from '../schemas/relatorioFotograficoStorage.zod';
import type { RelatorioFotograficoFoto, RelatorioFotograficoMeta, RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';

const PAYLOAD_KEY_PREFIX = 'iso-pro-rf-payload-v1-';
const SNAPSHOT_ID = 'default';
const MAX_FOTOS = 80;

function relatorioRfLegacyStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-relatorio-fotografico-v1');
}

function relatorioRfCatalogStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-rf-catalog-v1');
}

function relatorioRfSeqStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-relatorio-fotografico-num-seq');
}

/** ID usado ao migrar o armazenamento antigo (um único blob). */
export const LEGACY_REPORT_ID = 'rf-default';

function payloadStorageKey(id: string): string {
  return getScopedIsoProStorageKey(`${PAYLOAD_KEY_PREFIX}${id}`);
}

function isRfPayloadLocalStorageKey(key: string): boolean {
  return key.startsWith(PAYLOAD_KEY_PREFIX) && isStorageKeyForAmbienteAtivo(key);
}

/** Chave estável do blob no IndexedDB para uma foto do relatório fotográfico. */
export function relatorioFotoBlobKey(reportId: string, fotoId: string): string {
  return `${MEDIA_REF_PREFIX}rf:${reportId.trim()}:${fotoId.trim()}`;
}

export async function hydrateRelatorioFotograficoPayload(p: RelatorioFotograficoPayload): Promise<RelatorioFotograficoPayload> {
  if (typeof indexedDB === 'undefined') return p;
  const rid = p.reportId.trim();
  if (!rid) return p;
  try {
    const fotos: RelatorioFotograficoFoto[] = [];
    for (const f of p.fotos) {
      const du = f.dataUrl?.trim() ?? '';
      if (du.startsWith('data:image/')) {
        fotos.push(f);
        continue;
      }
      const ref = (f.imageRef && isMediaRefKey(f.imageRef) ? f.imageRef : relatorioFotoBlobKey(rid, f.id)) as string;
      const blob = await mediaBlobGet(ref);
      if (!blob) {
        fotos.push({ ...f, dataUrl: '', imageRef: ref });
        continue;
      }
      fotos.push({ ...f, dataUrl: await blobToDataUrl(blob), imageRef: ref });
    }
    return { ...p, fotos };
  } catch {
    return p;
  }
}

export async function persistRelatorioFotograficoFotosToIdb(p: RelatorioFotograficoPayload): Promise<RelatorioFotograficoPayload> {
  if (typeof indexedDB === 'undefined') return p;
  const rid = p.reportId.trim();
  if (!rid) return p;
  try {
    const fotos: RelatorioFotograficoFoto[] = [];
    for (const f of p.fotos) {
      const key =
        f.imageRef && isMediaRefKey(f.imageRef) ? f.imageRef : relatorioFotoBlobKey(rid, f.id);
      const du = f.dataUrl?.trim() ?? '';
      if (du.startsWith('data:image/')) {
        await mediaBlobPut(key, await dataUrlToBlob(du));
        fotos.push({ ...f, imageRef: key, dataUrl: '' });
        continue;
      }
      if (f.imageRef && isMediaRefKey(f.imageRef)) {
        fotos.push({ ...f, imageRef: f.imageRef, dataUrl: '' });
        continue;
      }
      fotos.push(f);
    }
    return { ...p, fotos };
  } catch {
    return p;
  }
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
    const raw = window.localStorage.getItem(relatorioRfSeqStorageKey());
    let o: { year?: string; n?: number } = {};
    if (raw) {
      try {
        o = parseRelatorioFotograficoSeqState(JSON.parse(raw));
      } catch {
        o = {};
      }
    }
    const sameYear = o.year === year;
    const n = sameYear && typeof o.n === 'number' ? o.n + 1 : 1;
    window.localStorage.setItem(relatorioRfSeqStorageKey(), JSON.stringify({ year, n }));
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
    if (!id) continue;
    const dataUrl = String(item.dataUrl ?? '').trim();
    const imageRef = String(item.imageRef ?? '').trim();
    if (imageRef.startsWith(MEDIA_REF_PREFIX)) {
      fotos.push({
        id,
        dataUrl: dataUrl.startsWith('data:image/') ? dataUrl : '',
        imageRef,
        legenda: String(item.legenda ?? '').slice(0, 2000),
        createdAt: String(item.createdAt ?? new Date().toISOString()),
        mostrarLegendaImpressao: item.mostrarLegendaImpressao === false ? false : true,
      });
      if (fotos.length >= MAX_FOTOS) break;
      continue;
    }
    if (!dataUrl.startsWith('data:image/')) continue;
    fotos.push({
      id,
      dataUrl,
      imageRef: undefined,
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
  const raw = window.localStorage.getItem(relatorioRfCatalogStorageKey());
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return parseRelatorioFotograficoCatalogIds(parsed);
  } catch {
    return [];
  }
}

/** Migra o blob único antigo para o catálogo + chave por ID. */
function migrateLegacyIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const legacy = window.localStorage.getItem(relatorioRfLegacyStorageKey());
  if (!legacy) return;
  try {
    const p = normalizeRelatorioFotograficoPayload(JSON.parse(legacy) as unknown);
    const id = p.reportId.trim() || LEGACY_REPORT_ID;
    const withId = normalizeRelatorioFotograficoPayload({ ...p, reportId: id });
    window.localStorage.setItem(payloadStorageKey(id), JSON.stringify(withId));
    const ids = readCatalogIdsOnly();
    if (!ids.includes(id)) {
      window.localStorage.setItem(relatorioRfCatalogStorageKey(), JSON.stringify({ version: 1, ids: [id, ...ids] }));
    }
    window.localStorage.removeItem(relatorioRfLegacyStorageKey());
  } catch {
    /* ignore */
  }
}

function readCatalogIdsRaw(): string[] {
  if (typeof window === 'undefined') return [];
  migrateLegacyIfNeeded();
  const raw = window.localStorage.getItem(relatorioRfCatalogStorageKey());
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return parseRelatorioFotograficoCatalogIds(parsed);
  } catch {
    return [];
  }
}

function writeCatalogIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(relatorioRfCatalogStorageKey(), JSON.stringify({ version: 1, ids }));
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

async function writePayloadToStorage(payload: RelatorioFotograficoPayload): Promise<void> {
  if (typeof window === 'undefined') return;
  const id = payload.reportId.trim();
  if (!id) throw new Error('reportId obrigatorio para gravar.');
  const next = normalizeRelatorioFotograficoPayload({ ...payload, reportId: id });
  const persisted = await persistRelatorioFotograficoFotosToIdb(next);
  const json = JSON.stringify(persisted);
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
    .eq('tenant_id', getActiveTenantId())
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
      tenant_id: getActiveTenantId(),
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id,tenant_id' },
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

/** Resumo de relatórios já gravados no catálogo local, por `recebimentoId` (evitar duplicidade na UI). */
export type RelatorioFotograficoPorRecebimento = {
  reportId: string;
  numeroRelatorio: string;
  titulo: string;
};

/**
 * Mapa recebimentoId → relatórios fotográficos que já guardam esse vínculo (armazenamento local).
 * Não inclui rascunhos que ainda não foram gravados no catálogo.
 */
export function mapRecebimentoParaRelatoriosFotograficosSalvos(): Map<string, RelatorioFotograficoPorRecebimento[]> {
  const ids = readCatalogIdsRaw();
  const map = new Map<string, RelatorioFotograficoPorRecebimento[]>();
  for (const id of ids) {
    const p = readPayloadFromKey(id);
    if (!p) continue;
    const rid = p.recebimentoId?.trim();
    if (!rid) continue;
    const row: RelatorioFotograficoPorRecebimento = {
      reportId: (p.reportId || id).trim(),
      numeroRelatorio: p.numeroRelatorio.trim(),
      titulo: p.titulo.trim() || '(sem título)',
    };
    const cur = map.get(rid) ?? [];
    cur.push(row);
    map.set(rid, cur);
  }
  return map;
}

/**
 * Remove um relatório do armazenamento local, blobs associados e catálogo.
 */
export async function excluirRelatorioFotograficoLocal(reportId: string): Promise<ServiceResult<void>> {
  const id = reportId.trim();
  if (!id) return { success: false, error: 'ID invalido.' };
  if (typeof window === 'undefined') return { success: false, error: 'Ambiente invalido.' };
  try {
    if (typeof indexedDB !== 'undefined') {
      await mediaBlobDeleteByPrefix(`${MEDIA_REF_PREFIX}rf:${id}:`);
    }
    window.localStorage.removeItem(payloadStorageKey(id));
    const ids = readCatalogIdsRaw().filter((x) => x !== id);
    writeCatalogIds(ids);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Falha ao excluir.') };
  }
}

/**
 * Remove todos os relatórios fotográficos locais (`localStorage` + blobs `iso-media:rf:` no IndexedDB).
 * Útil para repor estado após testes ou corrupção; o número sequencial RF também é reposto.
 */
export async function limparTodosRelatoriosFotograficosLocais(): Promise<
  ServiceResult<{ removidosCatalogo: number; chavesPayload: number }>
> {
  if (typeof window === 'undefined') return { success: false, error: 'Ambiente invalido.' };
  try {
    const idsBefore = readCatalogIdsRaw();
    const removidosCatalogo = idsBefore.length;

    const payloadKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && isRfPayloadLocalStorageKey(key)) payloadKeys.push(key);
    }

    if (typeof indexedDB !== 'undefined') {
      await mediaBlobDeleteByPrefix(`${MEDIA_REF_PREFIX}rf:`);
    }
    for (const k of payloadKeys) {
      window.localStorage.removeItem(k);
    }
    writeCatalogIds([]);
    window.localStorage.removeItem(relatorioRfLegacyStorageKey());
    window.localStorage.removeItem(relatorioRfSeqStorageKey());

    return {
      success: true,
      data: { removidosCatalogo, chavesPayload: payloadKeys.length },
    };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Falha ao limpar armazenamento local.') };
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
    return { success: true, data: await hydrateRelatorioFotograficoPayload(local), meta: { source: 'local' } };
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
        await writePayloadToStorage(merged);
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
    data: await hydrateRelatorioFotograficoPayload(fallback.data),
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
    const blockedRf = whenBusinessWriteBlockedResult<RelatorioFotograficoPayload>();
    if (blockedRf) return blockedRf;
    try {
      await writePayloadToStorage(next);
      const stored = readPayloadFromKey(id) ?? next;
      return { success: true, data: await hydrateRelatorioFotograficoPayload(stored), meta: { source: 'local' } };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error, 'Falha ao gravar.'),
      };
    }
  }

  try {
    await writePayloadToStorage(next);
    const stored = readPayloadFromKey(id) ?? next;
    const forCloud = await hydrateRelatorioFotograficoPayload(stored);
    await writeRemotePayload(forCloud);
    return { success: true, data: forCloud, meta: { source: 'supabase' } };
  } catch (error) {
    try {
      await writePayloadToStorage(next);
      const stored = readPayloadFromKey(id) ?? next;
      return {
        success: true,
        data: await hydrateRelatorioFotograficoPayload(stored),
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
export async function salvarRelatorioFotograficoLocalApenas(
  payload: RelatorioFotograficoPayload,
): Promise<ServiceResult<RelatorioFotograficoPayload>> {
  const id = payload.reportId.trim();
  if (!id) return { success: false, error: 'Identificador do relatório em falta.' };
  const blockedRfLocal = whenBusinessWriteBlockedResult<RelatorioFotograficoPayload>();
  if (blockedRfLocal) return blockedRfLocal;
  const next: RelatorioFotograficoPayload = {
    ...normalizeRelatorioFotograficoPayload(payload),
    salvoEm: new Date().toISOString(),
  };
  try {
    await writePayloadToStorage(next);
    const stored = readPayloadFromKey(id) ?? next;
    return { success: true, data: await hydrateRelatorioFotograficoPayload(stored), meta: { source: 'local' } };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, 'Falha ao gravar.') };
  }
}

/**
 * Estimativa do tamanho em bytes se o payload for serializado (UTF-8).
 * Útil para antecipar quota do navegador (fotos em base64 crescem rápido).
 */
export function estimativaBytesPayloadRelatorioFotografico(p: RelatorioFotograficoPayload): number {
  try {
    return new Blob([JSON.stringify(normalizeRelatorioFotograficoPayload(p))]).size;
  } catch {
    return 0;
  }
}

/**
 * Soma o tamanho das chaves `localStorage` usadas só por relatórios fotográficos
 * (payloads, catálogo, sequência numérica, legado).
 */
export function estimativaBytesTotalArmazenamentoRfLocal(): number {
  if (typeof window === 'undefined') return 0;
  const catalogKey = relatorioRfCatalogStorageKey();
  const seqKey = relatorioRfSeqStorageKey();
  const legacyKey = relatorioRfLegacyStorageKey();
  let total = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (
      isRfPayloadLocalStorageKey(key) ||
      key === catalogKey ||
      key === seqKey ||
      key === legacyKey
    ) {
      const v = window.localStorage.getItem(key);
      if (v) total += new Blob([v]).size;
    }
  }
  return total;
}

/** Tamanho aproximado de todo o `localStorage` desta origem (outros módulos incluídos). */
export function estimativaBytesTodoLocalStorage(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const v = window.localStorage.getItem(key);
    if (v) total += new Blob([v]).size;
  }
  return total;
}

/** Tamanho atual da chave do payload no `localStorage` (0 se ainda não existir). */
export function estimativaBytesPayloadGravadoLocal(reportId: string): number {
  if (typeof window === 'undefined' || !reportId.trim()) return 0;
  const raw = window.localStorage.getItem(payloadStorageKey(reportId.trim()));
  if (!raw) return 0;
  return new Blob([raw]).size;
}

/**
 * Projeta o tamanho total do `localStorage` se o payload deste relatório for gravado agora
 * (substitui a entrada anterior do mesmo `reportId`).
 */
export function estimativaBytesTodoLocalStorageAposGravar(reportId: string, p: RelatorioFotograficoPayload): number {
  if (typeof window === 'undefined') return estimativaBytesPayloadRelatorioFotografico(p);
  const antes = estimativaBytesPayloadGravadoLocal(reportId);
  const depois = estimativaBytesPayloadRelatorioFotografico(p);
  return estimativaBytesTodoLocalStorage() - antes + depois;
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
