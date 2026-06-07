import { BrowserWindow, app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ícone da janela / barra de tarefas:
 * - Dev: `build/icon.ico` (gerado por `npm run build:icon`).
 * - Empacotado: `resources/icon.ico` (copiado pelo electron-builder — ver `extraResources`); sem isto o Electron usa o ícone por defeito.
 */
function resolveOptionalWindowIcon(): string | undefined {
  const devPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const packagedPath = path.join(process.resourcesPath, 'icon.ico');
  const candidate = app.isPackaged ? packagedPath : devPath;
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return undefined;
}

/**
 * - Dev (electron/.dev-main.mjs): preload em electron/preload/index.mjs
 * - Prod (dist-electron/main.mjs, empacotado ou `electron .`): preload.cjs ao lado do main
 */
export function resolvePreloadPath(): string {
  const normalized = __dirname.replace(/\\/g, '/');
  if (normalized.includes('dist-electron')) {
    return path.join(__dirname, 'preload.cjs');
  }
  return path.join(__dirname, 'preload', 'index.mjs');
}

export function createMainWindow() {
  const windowIcon = resolveOptionalWindowIcon();
  const devServerUrl = process.env.VITE_DEV_SERVER_URL?.replace(/\/$/, '');
  const isDevServer = Boolean(devServerUrl);

  const window = new BrowserWindow({
    title: 'I.S.O PRO — Gestão de materiais',
    ...(windowIcon ? { icon: windowIcon } : {}),
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    center: true,
    show: false,
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

  window.once('ready-to-show', () => {
    window.show();
    window.focus();
    window.moveTop();
  });

  if (isDevServer) {
    const devUrl = `${devServerUrl}/`;
    let reloadAttempts = 0;

    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return;
      console.warn('[I.S.O PRO] Falha ao carregar dev server:', errorCode, errorDescription, validatedURL);
      if (reloadAttempts < 8) {
        reloadAttempts += 1;
        setTimeout(() => {
          void window.loadURL(devUrl);
        }, 1200);
      }
    });

    window.webContents.on('did-finish-load', () => {
      void window.webContents
        .executeJavaScript(`Boolean(document.getElementById('root')?.childElementCount)`)
        .then((hasContent) => {
          if (!hasContent && reloadAttempts < 8) {
            reloadAttempts += 1;
            setTimeout(() => {
              void window.loadURL(devUrl);
            }, 1500);
          }
        })
        .catch(() => undefined);
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    void window.loadURL(devUrl);
    if (process.env.ISO_PRO_DEVTOOLS === '1') {
      window.webContents.openDevTools({ mode: 'right' });
    }
  } else {
    /** Dev: __dirname = electron/ | Packaged: __dirname = dist-electron/ (asar) — em ambos ../dist/index.html */
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return window;
}
