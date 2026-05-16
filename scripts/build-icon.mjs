/**
 * Gera:
 * - build/icon.ico — .exe, atalhos, ícones NSIS (modo "para executável": BMP nos tamanhos pequenos).
 * - build/installerHeader.bmp — faixa 150×57 do assistente NSIS (oneClick: false); evita esticar um .ico quadrado.
 *
 * Fonte: `public/app-icon.svg` (quadrado) ou logo horizontal como fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import png2icons from 'png2icons';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const squareIcon = path.join(root, 'public', 'app-icon.svg');
const wideFallback = path.join(root, 'public', 'logo-institutional-default.svg');
const svgPath = fs.existsSync(squareIcon) ? squareIcon : wideFallback;
const outDir = path.join(root, 'build');
const outIco = path.join(outDir, 'icon.ico');
const outHeaderBmp = path.join(outDir, 'installerHeader.bmp');

/** Fundo #0f111a (alinhado à marca). */
const BG = { r: 15, g: 17, b: 26, alpha: 1 };

/**
 * BMP 24 bpp, top-down (biHeight negativo), linhas alinhadas a 4 bytes.
 * `rgb` = RGB intercalado, linha a linha de cima para baixo.
 */
function encodeBmp24(width, height, rgb) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const imageSize = rowStride * height;
  const fileSize = 14 + 40 + imageSize;
  const buf = Buffer.alloc(fileSize, 0);
  let o = 0;
  buf.write('BM', o);
  o += 2;
  buf.writeUInt32LE(fileSize, o);
  o += 4;
  buf.writeUInt32LE(0, o);
  o += 4;
  buf.writeUInt32LE(54, o);
  o += 4;
  buf.writeUInt32LE(40, o);
  o += 4;
  buf.writeInt32LE(width, o);
  o += 4;
  buf.writeInt32LE(-height, o);
  o += 4;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt16LE(24, o);
  o += 2;
  buf.writeUInt32LE(0, o);
  o += 4;
  buf.writeUInt32LE(imageSize, o);
  o += 4;
  buf.writeInt32LE(0, o);
  o += 4;
  buf.writeInt32LE(0, o);
  o += 4;
  buf.writeUInt32LE(0, o);
  o += 4;
  buf.writeUInt32LE(0, o);
  o += 4;
  for (let y = 0; y < height; y++) {
    const rowOff = 54 + y * rowStride;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      buf[rowOff + x * 3] = rgb[src + 2];
      buf[rowOff + x * 3 + 1] = rgb[src + 1];
      buf[rowOff + x * 3 + 2] = rgb[src + 0];
    }
  }
  return buf;
}

const masterPng = await sharp(svgPath)
  .resize(512, 512, { fit: 'contain', background: BG })
  .png()
  .toBuffer();

png2icons.clearCache();
const icoBuffer = png2icons.createICO(
  masterPng,
  png2icons.BICUBIC,
  0,
  false,
  true,
);
if (!icoBuffer) {
  throw new Error('png2icons.createICO falhou (ver SVG de entrada).');
}

/** NSIS MUI_HEADERIMAGE: 150×57 px (assisted installer). */
const headerRgb = await sharp(svgPath)
  .resize(150, 57, { fit: 'cover', position: 'center', background: BG })
  .flatten({ background: BG })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

if (headerRgb.info.channels !== 3) {
  throw new Error(`installerHeader: esperado 3 canais RGB, veio ${headerRgb.info.channels}.`);
}

const headerBmp = encodeBmp24(150, 57, headerRgb.data);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outIco, icoBuffer);
fs.writeFileSync(outHeaderBmp, headerBmp);
console.log('build/icon.ico');
console.log('build/installerHeader.bmp');
