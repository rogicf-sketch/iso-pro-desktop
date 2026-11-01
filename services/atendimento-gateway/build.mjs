import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const outDir = path.join(here, 'dist');

const esbuildMod = await import(pathToFileURL(path.join(root, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
const { build } = esbuildMod;

fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(here, 'src', 'index.ts')],
  outfile: path.join(outDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  tsconfig: path.join(root, 'tsconfig.app.json'),
});

console.log('atendimento-gateway: dist/index.mjs');
