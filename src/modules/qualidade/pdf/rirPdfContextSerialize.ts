import type { RirPdfBranding, RirPdfContexto } from './rirPdfDocument';

export type RirPdfContextoWire = {
  registro: RirPdfContexto['registro'];
  branding: Omit<RirPdfBranding, 'logoPng' | 'logoJpg'> & {
    logoPngBase64?: string;
    logoJpgBase64?: string;
  };
  uoExibir: string;
  localExibir: string;
  contratoExibir: string;
  disciplinaExibir: string;
  escopoLinha: string;
  emitidoEm: string;
  logoDataUrl?: string;
  fonteFamilia?: string;
};

function b64ToBytes(b64?: string): Uint8Array | undefined {
  if (!b64) return undefined;
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes?: Uint8Array): string | undefined {
  if (!bytes?.length) return undefined;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** IPC Electron — omite logos embutidos (o main carrega do disco; evita falha silenciosa por payload grande). */
export function serializarContextoRirPdfParaIpc(ctx: RirPdfContexto): RirPdfContextoWire {
  return {
    registro: ctx.registro,
    branding: {
      cliente: ctx.branding.cliente,
      projeto: ctx.branding.projeto,
      rodapeInstituicao: ctx.branding.rodapeInstituicao,
    },
    uoExibir: ctx.uoExibir,
    localExibir: ctx.localExibir,
    contratoExibir: ctx.contratoExibir,
    disciplinaExibir: ctx.disciplinaExibir,
    escopoLinha: ctx.escopoLinha,
    emitidoEm: ctx.emitidoEm,
    fonteFamilia: ctx.fonteFamilia,
  };
}

export function serializarContextoRirPdf(ctx: RirPdfContexto): RirPdfContextoWire {
  return {
    registro: ctx.registro,
    branding: {
      cliente: ctx.branding.cliente,
      projeto: ctx.branding.projeto,
      rodapeInstituicao: ctx.branding.rodapeInstituicao,
      logoPngBase64: bytesToB64(ctx.branding.logoPng),
      logoJpgBase64: bytesToB64(ctx.branding.logoJpg),
    },
    uoExibir: ctx.uoExibir,
    localExibir: ctx.localExibir,
    contratoExibir: ctx.contratoExibir,
    disciplinaExibir: ctx.disciplinaExibir,
    escopoLinha: ctx.escopoLinha,
    emitidoEm: ctx.emitidoEm,
    logoDataUrl: ctx.logoDataUrl,
    fonteFamilia: ctx.fonteFamilia,
  };
}

export function deserializarContextoRirPdf(wire: RirPdfContextoWire): RirPdfContexto {
  return {
    registro: wire.registro,
    branding: {
      cliente: wire.branding.cliente,
      projeto: wire.branding.projeto,
      rodapeInstituicao: wire.branding.rodapeInstituicao,
      logoPng: b64ToBytes(wire.branding.logoPngBase64),
      logoJpg: b64ToBytes(wire.branding.logoJpgBase64),
    },
    uoExibir: wire.uoExibir,
    localExibir: wire.localExibir,
    contratoExibir: wire.contratoExibir,
    disciplinaExibir: wire.disciplinaExibir,
    escopoLinha: wire.escopoLinha,
    emitidoEm: wire.emitidoEm,
    logoDataUrl: wire.logoDataUrl,
    fonteFamilia: wire.fonteFamilia,
  };
}

export function bytesFromBase64Main(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function bytesToBase64Main(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
