import { blobToDataUrl, dataUrlToBlob } from '../../../lib/mediaBlobCodec';
import {
  canUseEvidenciasStorage,
  evidenciasPathRnc,
  isStorageRef,
  resolveEvidenciaToBlob,
  resolveEvidenciaToDataUrl,
  uploadEvidenciaBlob,
} from '../../../lib/evidenciasStorage';
import { isMediaRefKey, mediaBlobDeleteByPrefix, mediaBlobGet, mediaBlobPut, MEDIA_REF_PREFIX } from '../../../lib/mediaBlobStore';
import type { RncRegistro } from '../types/qualidade.types';

function prefixItemFotos(rncId: string, recebimentoItemId: string): string {
  return `${MEDIA_REF_PREFIX}rnc:${rncId.trim()}:${recebimentoItemId.trim()}:`;
}

function isEvidenciaRefOrData(v: string): boolean {
  return v.startsWith('data:image/') || isMediaRefKey(v) || isStorageRef(v);
}

/** Persiste fotos do item em IndexedDB e devolve só referências `iso-media:...`. */
async function persistItemFotosUrls(rncId: string, recebimentoItemId: string, urls: string[]): Promise<string[]> {
  const prefix = prefixItemFotos(rncId, recebimentoItemId);
  await mediaBlobDeleteByPrefix(prefix);
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const v = urls[i]?.trim() ?? '';
    if (!v) continue;
    if (isStorageRef(v)) {
      out.push(v);
      continue;
    }
    const key = `${prefix}${i}`;
    if (v.startsWith('data:image/')) {
      await mediaBlobPut(key, await dataUrlToBlob(v));
      out.push(key);
      continue;
    }
    if (isMediaRefKey(v)) {
      const blob = await mediaBlobGet(v);
      if (blob) {
        await mediaBlobPut(key, blob);
        out.push(key);
      }
    }
  }
  return out;
}

/** Move fotos inline para IndexedDB (mantém refs Storage se já existirem). */
export async function persistRncRegistroFotosToIdb(reg: RncRegistro): Promise<RncRegistro> {
  if (typeof indexedDB === 'undefined') return reg;
  const rid = reg.id.trim();
  if (!rid) return reg;
  try {
    const itensRnc = await Promise.all(
      (reg.itensRnc ?? []).map(async (it) => {
        const urls = it.fotosDataUrls ?? [];
        const nextUrls = await persistItemFotosUrls(rid, it.recebimentoItemId, urls);
        return { ...it, fotosDataUrls: nextUrls };
      }),
    );
    return { ...reg, itensRnc };
  } catch {
    return reg;
  }
}

/**
 * Envia fotos para o bucket Storage e devolve registo sem base64
 * (`fotosDataUrls` = `iso-storage:...`) para o JSON da base.
 */
export async function persistRncRegistroFotosToStorage(reg: RncRegistro): Promise<RncRegistro> {
  if (!canUseEvidenciasStorage()) {
    return hydrateRncRegistro(reg);
  }
  const rid = reg.id.trim();
  if (!rid) return reg;
  const itensRnc = await Promise.all(
    (reg.itensRnc ?? []).map(async (it) => {
      const urls = it.fotosDataUrls ?? [];
      const nextUrls: string[] = [];
      for (let i = 0; i < urls.length; i++) {
        const v = urls[i]?.trim() ?? '';
        if (!v) continue;
        if (isStorageRef(v)) {
          nextUrls.push(v);
          continue;
        }
        const blob = await resolveEvidenciaToBlob(v);
        if (!blob) continue;
        const path = evidenciasPathRnc(rid, it.recebimentoItemId, i);
        nextUrls.push(await uploadEvidenciaBlob(path, blob));
      }
      return { ...it, fotosDataUrls: nextUrls };
    }),
  );
  return { ...reg, itensRnc };
}

/** Carrega blobs (IDB / Storage / data URL) para data URL (UI / impressão). */
export async function hydrateRncRegistro(reg: RncRegistro): Promise<RncRegistro> {
  try {
    const itensRnc = await Promise.all(
      (reg.itensRnc ?? []).map(async (it) => {
        const urls = it.fotosDataUrls ?? [];
        const resolved: string[] = [];
        for (const v of urls) {
          const s = v?.trim() ?? '';
          if (!s || !isEvidenciaRefOrData(s)) continue;
          const dataUrl = await resolveEvidenciaToDataUrl(s);
          if (dataUrl) resolved.push(dataUrl);
        }
        return { ...it, fotosDataUrls: resolved };
      }),
    );
    return { ...reg, itensRnc };
  } catch {
    return reg;
  }
}

/** Remove todas as fotos RNC deste registo no IndexedDB. */
export async function deleteRncFotosFromIdb(rncId: string): Promise<void> {
  await mediaBlobDeleteByPrefix(`${MEDIA_REF_PREFIX}rnc:${rncId.trim()}:`);
}
