import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-electron');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appVersion = String(pkg.version ?? '0.0.0');

/** Bake DSN no main (mesmo .env do renderer) — sem expor service_role. */
function loadSentryDsnFromEnvFiles() {
  for (const name of ['.env', '.env.local', '.env.production']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = /^(?:VITE_SENTRY_DSN|SENTRY_DSN)\s*=\s*(.*)$/.exec(t);
      if (!m) continue;
      return m[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return String(process.env.VITE_SENTRY_DSN || process.env.SENTRY_DSN || '').trim();
}

fs.mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  external: ['electron', 'electron-updater', 'nodemailer', 'pdf-to-printer'],
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
};

const sentryDsn = loadSentryDsnFromEnvFiles();

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, 'electron', 'main', 'index.ts')],
  outfile: path.join(outDir, 'main.mjs'),
  define: {
    __ISO_PRO_APP_VERSION__: JSON.stringify(appVersion),
    __ISO_PRO_SENTRY_DSN__: JSON.stringify(sentryDsn),
  },
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

/** Copia ícone para dist-electron — barra de tarefas em `electron .` / unpackaged. */
function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.copyFileSync(from, to);
  return true;
}
const iconCopied =
  copyIfExists(path.join(root, 'build', 'icon.png'), path.join(outDir, 'icon.png')) ||
  copyIfExists(path.join(root, 'public', 'app-icon.png'), path.join(outDir, 'icon.png'));
copyIfExists(path.join(root, 'build', 'icon.ico'), path.join(outDir, 'icon.ico'));
if (!iconCopied) {
  console.warn('dist-electron: sem icon.png — corra npm run build:icon antes.');
}

console.log('dist-electron: main.mjs + preload.cjs');
