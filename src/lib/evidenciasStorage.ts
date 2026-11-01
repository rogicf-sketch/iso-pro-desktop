/**
 * Evidências fotográficas no Supabase Storage (bucket `evidencias` — plano ~100 GB).
 * Referências no JSON: `iso-storage:evidencias/{tenant}/rf|rnc/...`
 * A base (8 GB) guarda só o caminho; o binário fica no Storage.
 */

import { blobToDataUrl, dataUrlToBlob } from './mediaBlobCodec';
import { isMediaRefKey, mediaBlobGet } from './mediaBlobStore';
import { getActiveTenantId } from './isoProTenant';
import { canUseDesktopSupabaseFetch, createDesktopSupabaseFetch } from './supabaseDesktopFetch';
import { getSupabase, hasSupabaseConfig } from './supabase';

export const EVIDENCIAS_BUCKET = 'evidencias';
export const STORAGE_REF_PREFIX = 'iso-storage:';

export function isStorageRef(s: string | undefined | null): boolean {
  return typeof s === 'string' && s.startsWith(STORAGE_REF_PREFIX);
}

/** `iso-storage:evidencias/tenant/rf/...` → { bucket, path } */
export function parseStorageRef(ref: string): { bucket: string; path: string } | null {
  const raw = ref.trim();
  if (!raw.startsWith(STORAGE_REF_PREFIX)) return null;
  const rest = raw.slice(STORAGE_REF_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash).trim();
  const path = rest.slice(slash + 1).trim();
  if (!bucket || !path) return null;
  return { bucket, path };
}

export function makeStorageRef(path: string, bucket = EVIDENCIAS_BUCKET): string {
  const p = path.replace(/^\/+/, '').trim();
  return `${STORAGE_REF_PREFIX}${bucket}/${p}`;
}

export function evidenciasPathRf(reportId: string, fotoId: string, tenantId = getActiveTenantId()): string {
  return `${tenantId}/rf/${reportId.trim()}/${fotoId.trim()}.jpg`;
}

export function evidenciasPathRnc(
  rncId: string,
  itemId: string,
  index: number,
  tenantId = getActiveTenantId(),
): string {
  return `${tenantId}/rnc/${rncId.trim()}/${itemId.trim()}/${index}.jpg`;
}

export function evidenciasPathRir(rirId: string, tenantId = getActiveTenantId()): string {
  return `${tenantId}/rir/${rirId.trim()}.json`;
}

function guessContentType(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.startsWith('image/') || t === 'application/json') return t;
  return 'image/jpeg';
}

function contentTypeIsJson(blob: Blob): boolean {
  return guessContentType(blob) === 'application/json';
}

/** Faz upload (upsert) e devolve a referência `iso-storage:...`. */
export async function uploadEvidenciaBlob(path: string, blob: Blob): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase nao configurado.');
  const clean = path.replace(/^\/+/, '').trim();
  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(clean, blob, {
    upsert: true,
    contentType: guessContentType(blob),
    // JSON de RIR muda em cada gravacao — cache longo faz a lista mostrar status antigo.
    cacheControl: contentTypeIsJson(blob) ? '0' : '3600',
  });
  if (error) throw new Error(error.message);
  return makeStorageRef(clean);
}

/** Grava um objecto JSON no Storage (ex.: payload completo RIR). */
export async function uploadEvidenciaJson(path: string, data: unknown): Promise<string> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  return uploadEvidenciaBlob(path, blob);
}

/** Lê JSON do Storage. */
export async function downloadEvidenciaJson<T = unknown>(ref: string): Promise<T | null> {
  const parsed = parseStorageRef(ref);
  if (!parsed) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
  if (error || !data) return null;
  const text = await data.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function withTimeoutOrNull<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([
      Promise.resolve(p),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  }
}

/** Descarrega evidência do Storage como data URL (para UI / impressão). */
export async function downloadEvidenciaAsDataUrl(ref: string): Promise<string | null> {
  const parsed = parseStorageRef(ref);
  if (!parsed) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  // EXE: signed URL + fetch IPC (binário em base64) — evita hang eterno do Auth lock.
  const signedWrap = await withTimeoutOrNull(
    supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 60 * 60),
    15_000,
  );
  if (signedWrap && !signedWrap.error && signedWrap.data?.signedUrl) {
    try {
      const fetchImpl = canUseDesktopSupabaseFetch() ? createDesktopSupabaseFetch() : fetch;
      const res = await fetchImpl(signedWrap.data.signedUrl);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 24) return blobToDataUrl(blob);
      }
    } catch {
      /* tenta download API */
    }
  }

  const dl = await withTimeoutOrNull(
    supabase.storage.from(parsed.bucket).download(parsed.path),
    20_000,
  );
  if (!dl || dl.error || !dl.data) return null;
  if (dl.data.size < 24) return null;
  return blobToDataUrl(dl.data);
}

/**
 * URL para pré-visualização HTML (rápido):
 * - Storage → signed URL HTTPS (sem baixar + base64)
 * - IndexedDB → data URL (necessário na janela Electron)
 * - data: / http(s) → intacto
 */
export async function resolveEvidenciaToDisplayUrl(value: string): Promise<string | null> {
  const s = value?.trim() ?? '';
  if (!s) return null;
  if (s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://')) return s;
  if (isStorageRef(s)) {
    const parsed = parseStorageRef(s);
    if (!parsed) return null;
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
    return downloadEvidenciaAsDataUrl(s);
  }
  if (isMediaRefKey(s)) {
    const blob = await mediaBlobGet(s);
    if (!blob) return null;
    return blobToDataUrl(blob);
  }
  return null;
}

/**
 * Resolve qualquer forma de evidência para data URL:
 * data:image / iso-media (IndexedDB) / iso-storage (Supabase Storage).
 */
export async function resolveEvidenciaToDataUrl(value: string): Promise<string | null> {
  const s = value?.trim() ?? '';
  if (!s) return null;
  if (s.startsWith('data:image/')) return s;
  if (isStorageRef(s)) {
    return downloadEvidenciaAsDataUrl(s);
  }
  if (isMediaRefKey(s)) {
    const blob = await mediaBlobGet(s);
    if (!blob) return null;
    return blobToDataUrl(blob);
  }
  return null;
}

/**
 * Obtém Blob a partir de data URL, ref IndexedDB ou ref Storage
 * (para re-upload / migração).
 */
export async function resolveEvidenciaToBlob(value: string): Promise<Blob | null> {
  const s = value?.trim() ?? '';
  if (!s) return null;
  if (s.startsWith('data:image/')) return dataUrlToBlob(s);
  if (isStorageRef(s)) {
    const parsed = parseStorageRef(s);
    if (!parsed) return null;
    const supabase = getSupabase();
    if (!supabase) return null;

    // EXE: signed URL + fetch costuma funcionar quando storage.download falha na sessão.
    const { data: signed, error: signErr } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, 60 * 60);
    if (!signErr && signed?.signedUrl) {
      try {
        const fetchImpl = canUseDesktopSupabaseFetch() ? createDesktopSupabaseFetch() : fetch;
        const res = await fetchImpl(signed.signedUrl);
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) return blob;
        }
      } catch {
        /* tenta download API */
      }
    }

    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) return null;
    return data;
  }
  if (isMediaRefKey(s)) {
    return mediaBlobGet(s);
  }
  return null;
}

export function canUseEvidenciasStorage(): boolean {
  return hasSupabaseConfig();
}
