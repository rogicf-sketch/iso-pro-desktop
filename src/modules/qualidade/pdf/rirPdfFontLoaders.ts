import type { PDFFont } from 'pdf-lib';

export type FamiliaFonteRirPdf = 'Noto Sans';

export type FontesRirPdf = {
  font: PDFFont;
  fontBold: PDFFont;
  familia: FamiliaFonteRirPdf;
};

export type BytesFontesRir = {
  regular: Uint8Array;
  bold: Uint8Array;
  familia: FamiliaFonteRirPdf;
};

type LoadRirFontesEmbutidas = () => Promise<
  | { ok: true; familia: string; regular: string; bold: string }
  | { ok: false; reason?: string }
>;

type IsoDesktopApi = {
  loadRirPdfFontesEmbutidas?: LoadRirFontesEmbutidas;
};

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isoDesktopApi(): IsoDesktopApi | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const g = globalThis as typeof globalThis & { isoProDesktop?: IsoDesktopApi };
  return g.isoProDesktop;
}

/** Fontes Noto via IPC (main/fs). */
export async function tentarFontesNotoEmbutidas(): Promise<BytesFontesRir | null> {
  const api = isoDesktopApi()?.loadRirPdfFontesEmbutidas;
  if (!api) return null;
  try {
    const res = await api();
    if (!res.ok || !res.regular || !res.bold) return null;
    return {
      regular: bytesFromBase64(res.regular),
      bold: bytesFromBase64(res.bold),
      familia: 'Noto Sans',
    };
  } catch {
    return null;
  }
}
