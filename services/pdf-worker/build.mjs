/**
 * Empacota o worker PDF (Node) com handlers RIR + HTML.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const outDir = path.join(here, 'dist');

// esbuild do projeto raiz
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
  external: ['playwright', 'playwright-core', '@supabase/supabase-js', 'ws'],
  tsconfig: path.join(root, 'tsconfig.app.json'),
});

const fontsSrc = path.join(here, 'fonts');
const fontsDst = path.join(outDir, 'fonts');

function copiarFontesParaDist(srcDir) {
  fs.mkdirSync(fontsDst, { recursive: true });
  for (const nome of fs.readdirSync(srcDir)) {
    if (!/\.(ttf|woff)$/i.test(nome)) continue;
    fs.copyFileSync(path.join(srcDir, nome), path.join(fontsDst, nome));
  }
}

if (fs.existsSync(fontsSrc)) {
  copiarFontesParaDist(fontsSrc);
  console.log('pdf-worker: dist/fonts copiado');
} else {
  const publicFonts = path.join(root, 'public', 'fonts');
  if (fs.existsSync(publicFonts)) {
    copiarFontesParaDist(publicFonts);
    console.warn('pdf-worker: dist/fonts ← public/fonts (worker/fonts ausente)');
  } else {
    console.warn('pdf-worker: aviso — nenhuma pasta de fontes para copiar ao dist');
  }
}

console.log('pdf-worker: dist/index.mjs');
