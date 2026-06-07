/**
 * Sincroniza Noto Sans TTF para public/fonts — embedding PDF fiável.
 * TTF evita tofu que WOFF pode causar no visualizador + pdf-lib (subset:false).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'fonts');
const workerFontsDir = path.join(root, 'services', 'pdf-worker', 'fonts');

/** Fontes estáticas Google (TTF). */
const TTF_SOURCES = [
  {
    dest: 'noto-sans-regular.ttf',
    urls: [
      'https://github.com/google/fonts/raw/main/ofl/notosans/static/NotoSans-Regular.ttf',
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/static/NotoSans-Regular.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/static/NotoSans-Regular.ttf',
    ],
  },
  {
    dest: 'noto-sans-bold.ttf',
    urls: [
      'https://github.com/google/fonts/raw/main/ofl/notosans/static/NotoSans-Bold.ttf',
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/static/NotoSans-Bold.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/static/NotoSans-Bold.ttf',
    ],
  },
];

/** Fallback @fontsource (woff) — pdf-lib usa subset:true; ver fontePrecisaSubset(). */
const WOFF_FALLBACK = [
  ['noto-sans-latin-ext-400-normal.woff', 'noto-sans-regular.woff'],
  ['noto-sans-latin-ext-700-normal.woff', 'noto-sans-bold.woff'],
];

function isFonteValida(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return sig === 'OTTO' || sig === 'true' || sig === 'wOFF' || sig === 'wOF2' || sig === '\0\u0001\0\0';
}

function isTtf(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return sig === 'OTTO' || sig === 'true' || sig === '\0\u0001\0\0';
}

async function baixarPrimeiro(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (isFonteValida(buf)) return buf;
    } catch {
      /* próximo */
    }
  }
  return null;
}

function copiarWoffFallback() {
  const srcDir = path.join(root, 'node_modules', '@fontsource', 'noto-sans', 'files');
  if (!fs.existsSync(srcDir)) return false;
  let ok = true;
  for (const [srcName, destName] of WOFF_FALLBACK) {
    const src = path.join(srcDir, srcName);
    const dest = path.join(outDir, destName);
    if (!fs.existsSync(src)) {
      ok = false;
      continue;
    }
    fs.copyFileSync(src, dest);
    console.warn(`sync-rir-pdf-fonts: fallback woff → ${destName}`);
  }
  return ok;
}

function copiarParaWorker() {
  fs.mkdirSync(workerFontsDir, { recursive: true });
  for (const nome of fs.readdirSync(outDir)) {
    if (!/\.(ttf|woff)$/i.test(nome)) continue;
    fs.copyFileSync(path.join(outDir, nome), path.join(workerFontsDir, nome));
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  let ttfOk = 0;
  for (const { dest, urls } of TTF_SOURCES) {
    const outPath = path.join(outDir, dest);
    if (fs.existsSync(outPath)) {
      const existing = fs.readFileSync(outPath);
      if (isTtf(existing)) {
        console.log(`${dest} ← TTF existente (${Math.round(existing.length / 1024)} KB)`);
        ttfOk++;
        continue;
      }
    }
    const buf = await baixarPrimeiro(urls);
    if (buf && isTtf(buf)) {
      fs.writeFileSync(outPath, buf);
      console.log(`${dest} ← TTF (${Math.round(buf.length / 1024)} KB)`);
      ttfOk++;
    } else {
      console.warn(`sync-rir-pdf-fonts: TTF não baixado para ${dest}`);
    }
  }

  if (ttfOk < 2) {
    console.warn('sync-rir-pdf-fonts: tentando fallback woff de @fontsource…');
    if (!copiarWoffFallback()) {
      console.error('sync-rir-pdf-fonts: falhou — execute npm install e tente de novo.');
      process.exit(1);
    }
    if (ttfOk < 1) {
      console.error('sync-rir-pdf-fonts: regular TTF ausente — PDF RIR pode falhar.');
      process.exit(1);
    }
    const regularTtf = path.join(outDir, 'noto-sans-regular.ttf');
    const boldTtf = path.join(outDir, 'noto-sans-bold.ttf');
    if (!fs.existsSync(boldTtf) && fs.existsSync(regularTtf)) {
      console.warn(
        'sync-rir-pdf-fonts: noto-sans-bold.ttf não baixado — o motor usa TTF regular para rótulos bold (sem tofu).',
      );
    }
  }

  copiarParaWorker();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
