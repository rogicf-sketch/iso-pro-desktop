/**
 * Gera PNG de alta resolução do logo institucional para PDF (~300 DPI em 118 pt).
 * Saída: public/logo-institutional-print.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public', 'logo-institutional-default.svg');
const outPath = path.join(root, 'public', 'logo-institutional-print.png');

/** 118 pt × (300 DPI / 72) ≈ 492 px; margem → 590 px de largura. */
const LARGURA_PX = 590;

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.warn('render-logo-print-png: SVG não encontrado, ignorado.');
    return;
  }
  await sharp(svgPath, { density: 300 })
    .resize(LARGURA_PX, null, { fit: 'inside', withoutEnlargement: false })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log(`logo-institutional-print.png → ${meta.width}×${meta.height}px`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
