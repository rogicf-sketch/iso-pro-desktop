/**
 * Empacota o processo principal e o preload para dist-electron/ (produção e testes locais).
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-electron');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appVersion = String(pkg.version ?? '0.0.0');

fs.mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  external: ['electron', 'nodemailer', 'pdf-to-printer'],
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
  outfile: path.join(outDir, 'preload.cjs'),
  format: 'cjs',
  define: {
    __ISO_PRO_APP_VERSION__: JSON.stringify(appVersion),
  },
});

console.log('dist-electron: main.mjs + preload.cjs');
