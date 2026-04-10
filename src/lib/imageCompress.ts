/**
 * Redimensiona e comprime imagens no browser antes de persistir (relatório fotográfico, anexos, etc.).
 * Usa canvas + JPEG por omissão (bom equilíbrio tamanho/qualidade para evidências).
 */

export type ImageCompressOptions = {
  /** Maior lado da imagem em px após redimensionar (mantém proporção). */
  maxEdgePx?: number;
  /** Tamanho máximo alvo do ficheiro de saída (o algoritmo baixa qualidade e, se preciso, a escala). */
  maxBytes?: number;
  /** Qualidade inicial JPEG 0–1. */
  initialQuality?: number;
  /** Qualidade mínima JPEG antes de reduzir mais o lado. */
  minQuality?: number;
  /** Fator multiplicativo do lado quando ainda excede maxBytes (ex.: 0,92). */
  scaleStep?: number;
};

const DEFAULTS: Required<ImageCompressOptions> = {
  maxEdgePx: 1680,
  maxBytes: 600 * 1024,
  initialQuality: 0.82,
  minQuality: 0.48,
  scaleStep: 0.9,
};

/** Calcula dimensões contidas com maior lado = maxEdge (exportado para testes). */
export function computeContainedSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  if (width <= maxEdge && height <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const ratio = Math.min(maxEdge / width, maxEdge / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

/**
 * Comprime um ficheiro de imagem para JPEG.
 * Devolve `null` se o tipo não for suportado para decode no browser.
 */
export async function compressImageFileToJpeg(
  file: File,
  options?: ImageCompressOptions,
): Promise<{ blob: Blob; width: number; height: number; originalSize: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  const opts = { ...DEFAULTS, ...options };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const w = bitmap.width;
  const h = bitmap.height;
  let { width: tw, height: th } = computeContainedSize(w, h, opts.maxEdgePx);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }

  const tryEncode = async (cw: number, ch: number, quality: number): Promise<Blob | null> => {
    canvas.width = cw;
    canvas.height = ch;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, cw, ch);
    return canvasToJpegBlob(canvas, quality);
  };

  let quality = opts.initialQuality;
  let blob = await tryEncode(tw, th, quality);

  while (blob && blob.size > opts.maxBytes && quality > opts.minQuality + 0.02) {
    quality = Math.max(opts.minQuality, quality - 0.07);
    blob = await tryEncode(tw, th, quality);
  }

  while (blob && blob.size > opts.maxBytes && (tw > 320 || th > 320)) {
    tw = Math.max(320, Math.round(tw * opts.scaleStep));
    th = Math.max(320, Math.round(th * opts.scaleStep));
    quality = opts.initialQuality;
    blob = await tryEncode(tw, th, quality);
    while (blob && blob.size > opts.maxBytes && quality > opts.minQuality + 0.02) {
      quality = Math.max(opts.minQuality, quality - 0.07);
      blob = await tryEncode(tw, th, quality);
    }
  }

  bitmap.close();

  if (!blob) return null;
  return {
    blob,
    width: tw,
    height: th,
    originalSize: file.size,
  };
}
