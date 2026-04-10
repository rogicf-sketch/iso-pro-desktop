/**
 * Remove artefactos de build (dist, dist-electron, build, dev bundle).
 * Não apaga release/ (instaladores geridos).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['dist', 'dist-electron', 'build'];
const files = [
  path.join(root, 'electron', '.dev-main.mjs'),
  path.join(root, 'electron', '.dev-main.mjs.map'),
];

for (const name of dirs) {
  const p = path.join(root, name);
  fs.rmSync(p, { recursive: true, force: true });
}

for (const p of files) {
  fs.rmSync(p, { force: true });
}

console.log('clean: dist, dist-electron, build, electron/.dev-main.mjs*');
