import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument } from 'pdf-lib';
import type { BytesFontesRir, FontesRirPdf } from './rirPdfFontLoaders';
import { tentarFontesNotoEmbutidas } from './rirPdfFontLoaders';

const FONT_CANDIDATES = {
  regular: ['noto-sans-regular.ttf', 'noto-sans-regular.woff'],
  bold: ['noto-sans-bold.ttf', 'noto-sans-bold.woff'],
} as const;

let bytesCache: BytesFontesRir | null = null;
let fontesExternas: BytesFontesRir | null = null;

type LoadRirFontesEmbutidas = () => Promise<
  | { ok: true; familia: string; regular: string; bold: string }
  | { ok: false; reason?: string }
>;

type IsoDesktopApi = {
  loadRirPdfFontesEmbutidas?: LoadRirFontesEmbutidas;
};

type BrowserGlobal = typeof globalThis & {
  location?: { href: string };
  fetch?: typeof fetch;
  isoProDesktop?: IsoDesktopApi;
};

function browserEnv(): BrowserGlobal | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as BrowserGlobal;
  return typeof g.location?.href === 'string' && typeof g.fetch === 'function' ? g : null;
}

export function definirFontesRirPdfExternas(fontes: BytesFontesRir): void {
  fontesExternas = fontes;
  bytesCache = fontes;
}

export function limparCacheFontesRirPdf(): void {
  bytesCache = null;
  fontesExternas = null;
}

export function validarBytesFontePdf(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 1024) return false;
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (sig === 'wOFF' || sig === 'wOF2' || sig === 'OTTO' || sig === 'true') return true;
  if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return true;
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 16));
  if (head.includes('<!DOCTYPE') || head.includes('<html')) return false;
  return false;
}

/** WOFF no FontFile2 quebra visualizadores — subset:true gera TrueType válido via fontkit. */
export function fontePrecisaSubset(bytes: Uint8Array): boolean {
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  return sig === 'wOFF' || sig === 'wOF2';
}

export function fonteEhTtf(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 4) return false;
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  return sig === 'OTTO' || sig === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0);
}

/** Bold WOFF (latin-ext) falha nos rótulos PT — usa TTF regular completo quando necessário. */
export function resolverBytesBoldParaEmbed(regular: Uint8Array, bold: Uint8Array): Uint8Array {
  if (fonteEhTtf(bold)) return bold;
  if (fonteEhTtf(regular)) return regular;
  return bold;
}

async function fetchFonte(nomeArquivo: string): Promise<Uint8Array | null> {
  const env = browserEnv();
  if (!env?.fetch || !env.location) return null;
  try {
    const base = env.location.href.replace(/\/[^/]*$/, '/');
    const url = new URL(`fonts/${nomeArquivo}`, base).href;
    const res = await env.fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return validarBytesFontePdf(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

async function carregarParFontes(nomes: readonly string[]): Promise<Uint8Array | null> {
  for (const nome of nomes) {
    const bytes = await fetchFonte(nome);
    if (bytes) return bytes;
  }
  return null;
}

async function carregarNotoSans(): Promise<BytesFontesRir> {
  if (fontesExternas) return fontesExternas;

  const api = browserEnv()?.isoProDesktop;
  if (api?.loadRirPdfFontesEmbutidas) {
    const ipc = await tentarFontesNotoEmbutidas();
    if (ipc && validarBytesFontePdf(ipc.regular) && validarBytesFontePdf(ipc.bold)) {
      return ipc;
    }
  }

  const regular = await carregarParFontes(FONT_CANDIDATES.regular);
  const bold = await carregarParFontes(FONT_CANDIDATES.bold);
  if (regular && bold) {
    return { regular, bold, familia: 'Noto Sans' };
  }

  throw new Error(
    'Fontes Noto Sans inválidas ou ausentes. Execute npm run sync:rir-fonts e reinicie o I.S.O PRO Desktop.',
  );
}

export async function carregarBytesFontesRirPdf(): Promise<BytesFontesRir> {
  if (bytesCache) return bytesCache;
  bytesCache = await carregarNotoSans();
  return bytesCache;
}

export async function incorporarFontesRirPdf(doc: PDFDocument): Promise<FontesRirPdf> {
  doc.registerFontkit(fontkit);
  const { regular, bold, familia } = await carregarBytesFontesRirPdf();

  if (!validarBytesFontePdf(regular) || !validarBytesFontePdf(bold)) {
    bytesCache = null;
    throw new Error('Buffer de fonte corrompido antes do embed — sync:rir-fonts necessário.');
  }

  const font = await doc.embedFont(regular, {
    subset: fontePrecisaSubset(regular),
    customName: 'NotoSans-Regular',
  });

  const boldBytes = resolverBytesBoldParaEmbed(regular, bold);
  let fontBold = await doc.embedFont(boldBytes, {
    subset: fontePrecisaSubset(boldBytes),
    customName: 'NotoSans-Bold',
  });

  const probeBold = 'GESTÃO · Obra/Depto · RELATÓRIO';
  if (fontBold.widthOfTextAtSize(probeBold, 10) <= 0 && boldBytes !== regular) {
    fontBold = await doc.embedFont(regular, {
      subset: fontePrecisaSubset(regular),
      customName: 'NotoSans-Bold',
    });
  }

  if (font.widthOfTextAtSize('Gestão', 10) <= 0) {
    throw new Error('Fonte Noto Sans embedada não renderiza texto — verifique public/fonts.');
  }
  if (fontBold.widthOfTextAtSize(probeBold, 10) <= 0) {
    throw new Error('Fonte bold do RIR não renderiza rótulos — execute npm run sync:rir-fonts.');
  }

  return { font, fontBold, familia };
}

export type { FontesRirPdf, FamiliaFonteRirPdf } from './rirPdfFontLoaders';
