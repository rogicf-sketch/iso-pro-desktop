import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import {
  absolutizarUrlMidiaParaDocumentoHtmlBlob,
  resolverUrlLogoInstitucionalParaHtmlImpresso,
} from '../../../lib/logoInstitucional';
import { RIR_PDF_LOGO_MAX } from './rirPdfLayout';

/** PNG de fábrica ~590 px (300 DPI para 118 pt). */
export const LOGO_INSTITUCIONAL_PRINT_PNG = './logo-institutional-print.png';

/** Rasterização dinâmica SVG: escala 5×, mínimo 590 px de largura. */
const LOGO_RASTER_SCALE = 5;
const LOGO_RASTER_MIN_WIDTH = 590;

export type LogoPdfCarregado = {
  png?: Uint8Array;
  jpg?: Uint8Array;
  dataUrl?: string;
};

function isSvg(url: string, contentType?: string): boolean {
  const u = url.toLowerCase();
  return u.includes('.svg') || (contentType ?? '').includes('svg');
}

function isLogoFabricaPadrao(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('logo-institutional-default.svg') || u.endsWith(LOGO_INSTITUCIONAL_PADRAO_FABRICA.replace('./', ''));
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Logo: HTTP ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
  };
}

function bytesParaDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return `data:${mime};base64,${btoa(bin)}`;
}

async function carregarPngAltaResolucaoFabrica(baseUrl: string): Promise<LogoPdfCarregado | null> {
  try {
    const pngUrl = new URL(LOGO_INSTITUCIONAL_PRINT_PNG.replace('./', ''), baseUrl).href;
    const { bytes } = await fetchBytes(pngUrl);
    return { png: bytes, dataUrl: bytesParaDataUrl(bytes, 'image/png') };
  } catch {
    return null;
  }
}

async function rasterizarSvgParaPng(url: string): Promise<LogoPdfCarregado> {
  if (typeof document === 'undefined') return {};

  const svgText = await (await fetch(url)).text();
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const objUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Falha ao carregar SVG do logo.'));
      el.src = objUrl;
    });

    const maxW = Math.max(RIR_PDF_LOGO_MAX.w * LOGO_RASTER_SCALE, LOGO_RASTER_MIN_WIDTH);
    const maxH = RIR_PDF_LOGO_MAX.h * LOGO_RASTER_SCALE;
    const scale = Math.min(maxW / (img.naturalWidth || maxW), maxH / (img.naturalHeight || maxH));
    const w = Math.max(Math.round((img.naturalWidth || maxW) * scale), LOGO_RASTER_MIN_WIDTH);
    const h = Math.round((img.naturalHeight || maxH) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1] ?? '');
    const png = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
    return { png, dataUrl };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/** Upscale PNG/JPG pequeno via canvas para nitidez no PDF. */
async function otimizarRasterExistente(bytes: Uint8Array, mime: string): Promise<LogoPdfCarregado> {
  if (typeof document === 'undefined') {
    return mime.includes('jpeg') || mime.includes('jpg')
      ? { jpg: bytes, dataUrl: bytesParaDataUrl(bytes, mime) }
      : { png: bytes, dataUrl: bytesParaDataUrl(bytes, mime) };
  }

  const dataUrl = bytesParaDataUrl(bytes, mime);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Falha ao decodificar logo.'));
    el.src = dataUrl;
  });

  if (img.naturalWidth >= LOGO_RASTER_MIN_WIDTH) {
    return mime.includes('jpeg') || mime.includes('jpg')
      ? { jpg: bytes, dataUrl }
      : { png: bytes, dataUrl };
  }

  const targetW = Math.max(img.naturalWidth * LOGO_RASTER_SCALE, LOGO_RASTER_MIN_WIDTH);
  const scale = targetW / img.naturalWidth;
  const w = Math.round(targetW);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { png: bytes, dataUrl };

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/png');
  const bin = atob(out.split(',')[1] ?? '');
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  return { png, dataUrl: out };
}

/** Carrega logo institucional otimizado para PDF nítido + preview HTML. */
export async function carregarLogoInstitucionalParaPdf(overrideUrl?: string | null): Promise<LogoPdfCarregado> {
  const url = absolutizarUrlMidiaParaDocumentoHtmlBlob(
    resolverUrlLogoInstitucionalParaHtmlImpresso(overrideUrl),
  );
  if (!url) return {};

  try {
    const baseForPrint = typeof window !== 'undefined' ? window.location.href.replace(/\/[^/]*$/, '/') : url;

    if (isLogoFabricaPadrao(url)) {
      const fabrica = await carregarPngAltaResolucaoFabrica(baseForPrint);
      if (fabrica?.png?.length) return fabrica;
    }

    if (isSvg(url)) return await rasterizarSvgParaPng(url);

    const { bytes, contentType } = await fetchBytes(url);
    if (contentType.includes('png') || url.toLowerCase().includes('.png')) {
      return otimizarRasterExistente(bytes, 'image/png');
    }
    if (contentType.includes('jpeg') || contentType.includes('jpg') || /\.jpe?g/i.test(url)) {
      const opt = await otimizarRasterExistente(bytes, 'image/jpeg');
      return opt.png ? opt : { jpg: bytes, dataUrl: bytesParaDataUrl(bytes, 'image/jpeg') };
    }
    return otimizarRasterExistente(bytes, 'image/png');
  } catch {
    return {};
  }
}
