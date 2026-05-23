/**
 * Empacota o processo principal e o preload para dist-electron/ (produção e testes locais).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-electron');

fs.mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  external: ['electron', 'nodemailer'],
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
};

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, 'electron', 'main', 'index.ts')],
  outfile: path.join(outDir, 'main.mjs'),
});

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, 'electron', 'preload', 'index.mjs')],
  outfile: path.join(outDir, 'preload.mjs'),
});

console.log('dist-electron: main.mjs + preload.mjs');
