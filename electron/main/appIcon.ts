import { app, nativeImage, type BrowserWindow, type NativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedIcon: NativeImage | undefined | null = null;

function packagedResourcesDir(): string {
  if (process.resourcesPath) return process.resourcesPath;
  return path.join(path.dirname(process.execPath), 'resources');
}

/**
 * Candidatos para icon.png / icon.ico / app-icon.png.
 * `build/` e gitignored — por isso tambem procuramos em `public/` e ao lado do main.
 */
export function resolveAppIconCandidates(): string[] {
  const fileNames = ['icon.png', 'icon.ico', 'app-icon.png'];
  const dirs: string[] = [];

  if (app.isPackaged) {
    dirs.push(packagedResourcesDir());
  }

  // dist-electron/ (prod local) e electron/ (dev bundle)
  dirs.push(
    __dirname,
    path.join(__dirname, '..'),
    path.join(__dirname, '..', 'build'),
    path.join(__dirname, '..', 'public'),
    path.join(__dirname, '..', '..', 'build'),
    path.join(__dirname, '..', '..', 'public'),
  );

  if (typeof app.getAppPath === 'function') {
    try {
      const appPath = app.getAppPath();
      dirs.push(path.join(appPath, 'build'), path.join(appPath, 'public'), appPath);
    } catch {
      /* app ainda a iniciar */
    }
  }

  dirs.push(path.join(process.cwd(), 'build'), path.join(process.cwd(), 'public'), process.cwd());

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const dir of dirs) {
    for (const name of fileNames) {
      const p = path.normalize(path.join(dir, name));
      if (seen.has(p)) continue;
      seen.add(p);
      candidates.push(p);
    }
  }
  return candidates;
}

/** Carrega ícone da app (PNG preferido — mais fiável que .ico no Electron/Windows). */
export function loadAppIconImage(): NativeImage | undefined {
  if (cachedIcon !== null) {
    return cachedIcon;
  }

  for (const iconPath of resolveAppIconCandidates()) {
    if (!fs.existsSync(iconPath)) continue;
    try {
      const buffer = fs.readFileSync(iconPath);
      let image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty()) {
        image = nativeImage.createFromPath(iconPath);
      }
      if (image.isEmpty()) continue;

      if (process.platform === 'win32') {
        const { width, height } = image.getSize();
        if (width !== 256 || height !== 256) {
          image = image.resize({ width: 256, height: 256, quality: 'best' });
        }
      }

      cachedIcon = image;
      console.info('[I.S.O PRO] Ícone da janela:', iconPath);
      return image;
    } catch {
      /* tenta próximo candidato */
    }
  }

  console.warn(
    '[I.S.O PRO] icon.png/icon.ico/app-icon.png não encontrado — barra de tarefas pode mostrar ícone genérico do Electron. Corra: npm run build:icon',
  );
  cachedIcon = undefined;
  return undefined;
}

export function applyAppIconToWindow(win: BrowserWindow): void {
  const icon = loadAppIconImage();
  if (icon) win.setIcon(icon);
}
