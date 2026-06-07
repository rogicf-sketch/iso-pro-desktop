import type { PDFImage, PDFPage, RGB } from 'pdf-lib';

/** Encaixa imagem em caixa mantendo proporcao (object-fit: contain). */
export function encaixarImagemPdf(
  img: PDFImage,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const iw = img.width;
  const ih = img.height;
  if (iw <= 0 || ih <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / iw, maxH / ih);
  return { width: iw * scale, height: ih * scale };
}

/** Retangulo com cantos arredondados (y = canto inferior esquerdo). */
export function desenharRetanguloArredondado(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  raio: number,
  opts: { fill?: RGB; border?: RGB; borderWidth?: number },
): void {
  const r = Math.max(0, Math.min(raio, w / 2, h / 2));
  if (r <= 0) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.borderWidth ?? 0,
    });
    return;
  }

  const path = [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    'Z',
  ].join(' ');

  page.drawSvgPath(path, {
    x,
    y,
    color: opts.fill,
    borderColor: opts.border,
    borderWidth: opts.borderWidth ?? 0,
  });
}

/** Pill horizontal (badge / tag). */
export function desenharPill(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: RGB; border?: RGB; borderWidth?: number },
): void {
  desenharRetanguloArredondado(page, x, y, w, h, h / 2, opts);
}

/** Barra vertical de destaque (secao INS-01). */
export function desenharBarraLateral(
  page: PDFPage,
  x: number,
  y: number,
  h: number,
  color: RGB,
  espessura = 3.5,
): void {
  desenharRetanguloArredondado(page, x, y, espessura, h, 1.5, { fill: color });
}
