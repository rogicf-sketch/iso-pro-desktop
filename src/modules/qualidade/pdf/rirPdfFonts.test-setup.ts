import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll } from 'vitest';
import { validarBytesFontePdf, definirFontesRirPdfExternas } from './rirPdfFonts';

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'public', 'fonts');

function lerFonteTeste(nomes: string[]): Uint8Array {
  for (const nome of nomes) {
    try {
      const bytes = new Uint8Array(readFileSync(join(fontsDir, nome)));
      if (validarBytesFontePdf(bytes)) return bytes;
    } catch {
      /* próximo */
    }
  }
  throw new Error(`Fonte de teste não encontrada em ${fontsDir}. Execute npm run sync:rir-fonts.`);
}

beforeAll(() => {
  definirFontesRirPdfExternas({
    regular: lerFonteTeste(['noto-sans-regular.ttf', 'noto-sans-regular.woff']),
    bold: lerFonteTeste(['noto-sans-bold.ttf', 'noto-sans-bold.woff']),
    familia: 'Noto Sans',
  });
});
