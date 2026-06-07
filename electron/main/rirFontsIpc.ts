import { app, ipcMain } from 'electron';

import fs from 'node:fs/promises';

import path from 'node:path';



const FONT_CANDIDATES = {

  regular: ['noto-sans-regular.ttf', 'noto-sans-regular.woff'],

  bold: ['noto-sans-bold.ttf', 'noto-sans-bold.woff'],

};



function isFonteValida(buf: Buffer): boolean {

  if (buf.length < 1024) return false;

  const sig = buf.subarray(0, 4).toString('ascii');

  if (sig === 'wOFF' || sig === 'wOF2' || sig === 'OTTO' || sig === 'true') return true;

  if (buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) return true;

  const head = buf.subarray(0, 16).toString('ascii');

  if (head.includes('<!DOCTYPE') || head.includes('<html')) return false;

  return false;

}



async function lerPrimeiraFonte(dir: string, nomes: string[]): Promise<Buffer | null> {

  for (const nome of nomes) {

    try {

      const buf = await fs.readFile(path.join(dir, nome));

      if (isFonteValida(buf)) return buf;

    } catch {

      /* próximo */

    }

  }

  return null;

}



function diretoriosFontesNoto(): string[] {

  const dirs: string[] = [];

  if (app.isPackaged) {

    dirs.push(path.join(process.resourcesPath, 'fonts'));

  }

  dirs.push(path.join(app.getAppPath(), 'dist', 'fonts'));

  dirs.push(path.join(app.getAppPath(), 'public', 'fonts'));

  return dirs;

}



/** Noto Sans via fs (main) — caminho garantido dev + instalador. */

export function registerRirFontsHandlers() {

  ipcMain.handle('desktop-rir:fontes-embutidas', async () => {

    try {

      for (const dir of diretoriosFontesNoto()) {

        const [regular, bold] = await Promise.all([

          lerPrimeiraFonte(dir, FONT_CANDIDATES.regular),

          lerPrimeiraFonte(dir, FONT_CANDIDATES.bold),

        ]);

        if (regular && bold) {

          return {

            ok: true as const,

            familia: 'Noto Sans',

            regular: regular.toString('base64'),

            bold: bold.toString('base64'),

            regularBytes: regular.length,

            boldBytes: bold.length,

            dir,

          };

        }

      }

      return {

        ok: false as const,

        reason: `Noto Sans TTF não encontrada. Pastas: ${diretoriosFontesNoto().join(' | ')}. Execute npm run sync:rir-fonts.`,

      };

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      return { ok: false as const, reason: msg };

    }

  });

}


