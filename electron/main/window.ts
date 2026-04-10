import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Ícone da janela em dev / `electron .` (gerado por `npm run build:icon`). No .exe empacotado o ícone já vem do instalador. */
function resolveOptionalWindowIcon(): string | undefined {
  const candidate = path.join(__dirname, '..', 'build', 'icon.ico');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return undefined;
}

/**
 * - Dev (electron/.dev-main.mjs): preload em electron/preload/index.mjs
 * - Prod (dist-electron/main.mjs, empacotado ou `electron .`): preload.mjs ao lado do main
 */
function resolvePreloadPath(): string {
  const normalized = __dirname.replace(/\\/g, '/');
  if (normalized.includes('dist-electron')) {
    return path.join(__dirname, 'preload.mjs');
  }
  return path.join(__dirname, 'preload', 'index.mjs');
}

export function createMainWindow() {
  const windowIcon = resolveOptionalWindowIcon();
  const window = new BrowserWindow({
    ...(windowIcon ? { icon: windowIcon } : {}),
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      /** Processo de renderização isolado (recomendado com preload + sem Node no renderer). */
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    /** Dev: __dirname = electron/ | Packaged: __dirname = dist-electron/ (asar) — em ambos ../dist/index.html */
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return window;
}
