import { app, net } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const PAGEDJS_SCRIPT_FILENAME = 'paged.polyfill.min.js';

/**
 * Em loadFile (file://), data:image enorme e https assinados falham com frequência.
 * Grava as imagens ao lado do HTML e troca o src para ficheiro relativo.
 */
function decodeHtmlAttrValue(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function materializarSrcImagensEmFicheiros(html: string, reportDir: string): Promise<string> {
  const re = /(<img\b[^>]*?\bsrc=")([^"]*)(")/gi;
  const matches = [...html.matchAll(re)];
  if (!matches.length) return html;

  let out = html;
  let idx = 0;
  for (const m of matches) {
    const full = m[0] ?? '';
    const prefix = m[1] ?? '';
    const srcRaw = (m[2] ?? '').trim();
    const suffix = m[3] ?? '';
    const src = decodeHtmlAttrValue(srcRaw);
    if (!full || !src) continue;
    if (src.startsWith('./') || src.startsWith('../')) continue;
    if (/^[a-zA-Z0-9._-]+$/.test(src)) continue; // já é ficheiro relativo (foto-0.jpg)
    if (src === 'logo-institutional-print.png' || src.endsWith(`/${PAGEDJS_SCRIPT_FILENAME}`)) continue;
    if (!src.includes(':')) continue;

    let bytes: Buffer | null = null;
    let ext = 'jpg';

    if (src.startsWith('data:image/')) {
      const dm = /^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/i.exec(src);
      if (!dm) continue;
      const rawExt = (dm[1] ?? 'jpeg').toLowerCase().replace('jpeg', 'jpg');
      ext = rawExt.includes('png') ? 'png' : rawExt.includes('webp') ? 'webp' : 'jpg';
      try {
        bytes = Buffer.from(dm[2] ?? '', 'base64');
      } catch {
        continue;
      }
    } else if (/^https?:\/\//i.test(src)) {
      try {
        const res = await net.fetch(src);
        if (!res.ok) continue;
        bytes = Buffer.from(await res.arrayBuffer());
        const ct = (res.headers.get('content-type') ?? '').toLowerCase();
        if (ct.includes('png')) ext = 'png';
        else if (ct.includes('webp')) ext = 'webp';
        else ext = 'jpg';
      } catch {
        continue;
      }
    } else {
      continue;
    }

    if (!bytes || bytes.length < 24) continue;
    const name = `foto-${idx++}.${ext}`;
    await fs.writeFile(path.join(reportDir, name), bytes);
    // Substitui só esta ocorrência (src pode repetir-se).
    out = out.replace(full, `${prefix}${name}${suffix}`);
  }
  return out;
}

export type RelatorioHtmlAsset = { name: string; base64: string };

async function gravarAssetsExplicitos(
  reportDir: string,
  assets: RelatorioHtmlAsset[] | undefined,
): Promise<void> {
  if (!assets?.length) return;
  for (const a of assets) {
    const name = String(a?.name ?? '').trim();
    const b64 = String(a?.base64 ?? '').trim();
    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name) || !b64) continue;
    try {
      await fs.writeFile(path.join(reportDir, name), Buffer.from(b64, 'base64'));
    } catch {
      /* ignore asset */
    }
  }
}

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
export async function escreverRelatorioHtmlTemp(
  html: string,
  assets?: RelatorioHtmlAsset[],
): Promise<RelatorioHtmlTempBundle> {
  if (!html.trim()) {
    throw new Error('HTML inválido ou vazio.');
  }

  const tmpRoot = app.getPath('temp');
  const reportDir = path.join(tmpRoot, `iso-pro-report-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(reportDir, { recursive: true });

  const htmlPath = path.join(reportDir, 'index.html');
  await gravarAssetsExplicitos(reportDir, assets);
  const htmlFinal = await materializarSrcImagensEmFicheiros(html, reportDir);
  await fs.writeFile(htmlPath, htmlFinal, 'utf8');

  if (htmlFinal.includes(`src="${PAGEDJS_SCRIPT_FILENAME}"`) || html.includes(`src="${PAGEDJS_SCRIPT_FILENAME}"`)) {
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
