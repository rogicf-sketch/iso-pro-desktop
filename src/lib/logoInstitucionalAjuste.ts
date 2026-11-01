/**
 * Ajuste do logo institucional: recorte de margens (branco/transparente) + zoom no slot.
 * O problema típico (ex. Montcalm) é PNG quadrado com muita margem — não o tamanho do quadro.
 */
import { normalizarLogoInstitucionalAspecto } from './logoInstitucionalTamanho';

export const LOGO_ZOOM_PCT_MIN = 80;
export const LOGO_ZOOM_PCT_MAX = 280;
export const LOGO_ZOOM_PCT_PADRAO = 100;
/** Zoom do logo de fábrica (chapa I.S.O PRO) — já calibrado para o slot dos relatórios. */
export const LOGO_ZOOM_PCT_FABRICA = 100;

export function normalizarLogoInstitucionalZoomPct(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return LOGO_ZOOM_PCT_PADRAO;
  return Math.min(LOGO_ZOOM_PCT_MAX, Math.max(LOGO_ZOOM_PCT_MIN, Math.round(n)));
}

/** Pixel “vazio”: transparente ou quase branco (margem de logos em fundo branco). */
export function pixelMargemLogo(
  r: number,
  g: number,
  b: number,
  a: number,
  whiteThreshold = 248,
  alphaThreshold = 12,
): boolean {
  if (a < alphaThreshold) return true;
  return r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold;
}

/**
 * Caixa envolvente do conteúdo (não-margem). Devolve null se a imagem for toda margem.
 */
export function boundingBoxConteudoLogo(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  whiteThreshold = 248,
  alphaThreshold = 12,
): { x: number; y: number; w: number; h: number } | null {
  if (width < 1 || height < 1 || data.length < width * height * 4) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixelMargemLogo(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!, whiteThreshold, alphaThreshold)) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const pad = Math.max(2, Math.round(Math.min(width, height) * 0.01));
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(width - 1, maxX + pad);
  const bottom = Math.min(height - 1, maxY + pad);
  return { x, y, w: right - x + 1, h: bottom - y + 1 };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem do logo.'));
    img.src = src;
  });
}

/**
 * Recorta margens brancas/transparentes. Se não houver margem útil, devolve a URL original.
 * Saída PNG (preserva tipografia e laranja de marcas).
 */
export async function recortarMargensLogoDataUrl(dataUrl: string): Promise<{
  dataUrl: string;
  recortou: boolean;
  antes: { w: number; h: number };
  depois: { w: number; h: number };
}> {
  if (typeof document === 'undefined') {
    return { dataUrl, recortou: false, antes: { w: 0, h: 0 }, depois: { w: 0, h: 0 } };
  }
  const img = await loadImageElement(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w < 8 || h < 8) {
    return { dataUrl, recortou: false, antes: { w, h }, depois: { w, h } };
  }

  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) {
    return { dataUrl, recortou: false, antes: { w, h }, depois: { w, h } };
  }
  sctx.drawImage(img, 0, 0);
  const imageData = sctx.getImageData(0, 0, w, h);
  const box = boundingBoxConteudoLogo(imageData.data, w, h);
  if (!box) {
    return { dataUrl, recortou: false, antes: { w, h }, depois: { w, h } };
  }

  const areaAntes = w * h;
  const areaDepois = box.w * box.h;
  // Só recorta se remover pelo menos ~12% de área (margem real).
  if (areaDepois >= areaAntes * 0.88) {
    return { dataUrl, recortou: false, antes: { w, h }, depois: { w, h } };
  }

  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  const octx = out.getContext('2d');
  if (!octx) {
    return { dataUrl, recortou: false, antes: { w, h }, depois: { w, h } };
  }
  octx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const cropped = out.toDataURL('image/png');
  return {
    dataUrl: cropped,
    recortou: true,
    antes: { w, h },
    depois: { w: box.w, h: box.h },
  };
}

export async function processarArquivoLogoInstitucionalComRecorte(
  file: File,
  toDataUrl: (blob: Blob) => Promise<string>,
): Promise<{ dataUrl: string; recortou: boolean } | null> {
  if (!file.type.startsWith('image/')) return null;
  if (file.type.includes('svg')) {
    return { dataUrl: await toDataUrl(file), recortou: false };
  }
  const rawUrl = await toDataUrl(file);
  if (!rawUrl.startsWith('data:')) return null;
  const trimmed = await recortarMargensLogoDataUrl(rawUrl);
  return { dataUrl: trimmed.dataUrl, recortou: trimmed.recortou };
}

/** Mede w/h de uma data URL ou URL de imagem (só browser). */
export async function medirAspectoLogoUrl(src: string): Promise<number> {
  if (typeof document === 'undefined' || !src.trim()) return 0;
  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      resolve(h > 0 ? normalizarLogoInstitucionalAspecto(w / h) : 0);
    };
    img.onerror = () => resolve(0);
    img.src = src;
  });
}
