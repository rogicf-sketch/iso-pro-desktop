/**
 * Gera build/icon.ico a partir de public/favicon.svg (multi-resolução para Windows).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const outDir = path.join(root, 'build');
const outIco = path.join(outDir, 'icon.ico');

const sizes = [256, 48, 32, 16];
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svgPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 15, g: 23, b: 42, alpha: 1 },
      })
      .png()
      .toBuffer(),
  ),
);

fs.mkdirSync(outDir, { recursive: true });
const icoBuffer = await pngToIco(pngBuffers);
fs.writeFileSync(outIco, icoBuffer);
console.log('build/icon.ico');
