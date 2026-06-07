import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const PAGEDJS_SCRIPT_FILENAME = 'paged.polyfill.min.js';

async function resolvePagedJsSourcePath(): Promise<string> {
  const candidates = [
    path.join(app.getAppPath(), 'node_modules', 'pagedjs', 'dist', PAGEDJS_SCRIPT_FILENAME),
    path.join(process.resourcesPath, 'vendor', PAGEDJS_SCRIPT_FILENAME),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* tentar próximo */
    }
  }
  throw new Error('Paged.js não encontrado (node_modules ou extraResources).');
}

export type RelatorioHtmlTempBundle = {
  htmlPath: string;
  reportDir: string;
  remove: () => Promise<void>;
};

/** Grava HTML + paged.polyfill.min.js numa pasta temporária (script relativo). */
export async function escreverRelatorioHtmlTemp(html: string): Promise<RelatorioHtmlTempBundle> {
  if (!html.trim()) {
    throw new Error('HTML inválido ou vazio.');
  }

  const tmpRoot = app.getPath('temp');
  const reportDir = path.join(tmpRoot, `iso-pro-report-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(reportDir, { recursive: true });

  const htmlPath = path.join(reportDir, 'index.html');
  await fs.writeFile(htmlPath, html, 'utf8');

  if (html.includes(`src="${PAGEDJS_SCRIPT_FILENAME}"`)) {
    const pagedDest = path.join(reportDir, PAGEDJS_SCRIPT_FILENAME);
    await fs.copyFile(await resolvePagedJsSourcePath(), pagedDest);
  }

  if (html.includes('logo-institutional-print.png')) {
    const logoCandidates = [
      path.join(app.getAppPath(), 'logo-institutional-print.png'),
      path.join(app.getAppPath(), 'dist', 'logo-institutional-print.png'),
      path.join(app.getAppPath(), 'public', 'logo-institutional-print.png'),
      path.join(process.resourcesPath, 'logo-institutional-print.png'),
    ];
    for (const src of logoCandidates) {
      try {
        await fs.access(src);
        await fs.copyFile(src, path.join(reportDir, 'logo-institutional-print.png'));
        break;
      } catch {
        /* próximo */
      }
    }
  }

  if (html.includes('./fonts/noto-sans')) {
    const fontsDest = path.join(reportDir, 'fonts');
    await fs.mkdir(fontsDest, { recursive: true });
    const fontCandidates = [
      path.join(app.getAppPath(), 'public', 'fonts'),
      path.join(app.getAppPath(), '..', 'public', 'fonts'),
      path.join(process.resourcesPath, 'fonts'),
    ];
    for (const src of fontCandidates) {
      try {
        await fs.access(src);
        for (const name of ['noto-sans-regular.woff', 'noto-sans-bold.woff']) {
          await fs.copyFile(path.join(src, name), path.join(fontsDest, name));
        }
        break;
      } catch {
        /* próximo */
      }
    }
  }

  return {
    htmlPath,
    reportDir,
    remove: async () => {
      try {
        await fs.rm(reportDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}
