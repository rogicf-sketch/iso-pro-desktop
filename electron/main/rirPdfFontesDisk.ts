import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { BytesFontesRir } from '../../src/modules/qualidade/pdf/rirPdfFontLoaders.ts';
import { validarBytesFontePdf } from '../../src/modules/qualidade/pdf/rirPdfFonts.ts';

const FONT_CANDIDATES = {
  regular: ['noto-sans-regular.ttf', 'noto-sans-regular.woff'],
  bold: ['noto-sans-bold.ttf', 'noto-sans-bold.woff'],
};

function diretoriosFontes(): string[] {
  const dirs: string[] = [];
  if (app.isPackaged) dirs.push(path.join(process.resourcesPath, 'fonts'));
  dirs.push(path.join(app.getAppPath(), 'dist', 'fonts'));
  dirs.push(path.join(app.getAppPath(), 'public', 'fonts'));
  return dirs;
}

function lerPrimeira(dir: string, nomes: string[]): Uint8Array | null {
  for (const nome of nomes) {
    try {
      const buf = fs.readFileSync(path.join(dir, nome));
      const bytes = new Uint8Array(buf);
      if (validarBytesFontePdf(bytes)) return bytes;
    } catch {
      /* próximo */
    }
  }
  return null;
}

/** Carrega Noto Sans do disco (main process) — fonte fiável para pdf-lib. */
export function carregarFontesNotoDoDisco(): BytesFontesRir {
  for (const dir of diretoriosFontes()) {
    const regular = lerPrimeira(dir, FONT_CANDIDATES.regular);
    const bold = lerPrimeira(dir, FONT_CANDIDATES.bold) ?? regular;
    if (regular) {
      return { regular, bold: bold ?? regular, familia: 'Noto Sans' };
    }
  }
  throw new Error(
    `Noto Sans não encontrada em: ${diretoriosFontes().join(' | ')}. Execute npm run sync:rir-fonts.`,
  );
}

export function diagnosticarFontesNoto(): { ok: true; dir: string; regularBytes: number; boldBytes: number } | { ok: false; dirs: string[] } {
  for (const dir of diretoriosFontes()) {
    const regular = lerPrimeira(dir, FONT_CANDIDATES.regular);
    const bold = lerPrimeira(dir, FONT_CANDIDATES.bold);
    if (regular && bold) {
      return { ok: true, dir, regularBytes: regular.length, boldBytes: bold.length };
    }
  }
  return { ok: false, dirs: diretoriosFontes() };
}
