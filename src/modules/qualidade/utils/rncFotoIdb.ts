import { blobToDataUrl, dataUrlToBlob } from '../../../lib/mediaBlobCodec';
import { isMediaRefKey, mediaBlobDeleteByPrefix, mediaBlobGet, mediaBlobPut, MEDIA_REF_PREFIX } from '../../../lib/mediaBlobStore';
import type { RncRegistro } from '../types/qualidade.types';

function prefixItemFotos(rncId: string, recebimentoItemId: string): string {
  return `${MEDIA_REF_PREFIX}rnc:${rncId.trim()}:${recebimentoItemId.trim()}:`;
}

/** Persiste fotos do item em IndexedDB e devolve só referências `iso-media:...`. */
async function persistItemFotosUrls(rncId: string, recebimentoItemId: string, urls: string[]): Promise<string[]> {
  const prefix = prefixItemFotos(rncId, recebimentoItemId);
  await mediaBlobDeleteByPrefix(prefix);
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const v = urls[i]?.trim() ?? '';
    if (!v) continue;
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

/** Move todas as fotos inline para IndexedDB (referências no registo). */
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

/** Carrega blobs referenciados e devolve `fotosDataUrls` em data URL (para UI / impressão / nuvem). */
export async function hydrateRncRegistro(reg: RncRegistro): Promise<RncRegistro> {
  if (typeof indexedDB === 'undefined') return reg;
  try {
    const itensRnc = await Promise.all(
      (reg.itensRnc ?? []).map(async (it) => {
        const urls = it.fotosDataUrls ?? [];
        const resolved: string[] = [];
        for (const v of urls) {
          const s = v?.trim() ?? '';
          if (!s) continue;
          if (s.startsWith('data:image/')) {
            resolved.push(s);
            continue;
          }
          if (isMediaRefKey(s)) {
            const blob = await mediaBlobGet(s);
            if (blob) {
              resolved.push(await blobToDataUrl(blob));
            }
          }
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
