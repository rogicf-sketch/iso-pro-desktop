import { compressImageFileToJpeg, type ImageCompressOptions } from '../../../lib/imageCompress';
import { blobToDataUrl, dataUrlToBlob } from '../../../lib/mediaBlobCodec';
import { absolutizarUrlMidiaParaDocumentoHtmlBlob } from '../../../lib/logoInstitucional';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

/** Subconjunto em `iso_pro_snapshot.payload.configuracoesSistema` para recibos no app Campo. */
export type ConfigReciboMobileSnapshot = {
  logoInstitucionalUrl?: string;
  documentoRodapeNome?: string;
  documentoRodapeCnpj?: string;
  cliente?: string;
  projeto?: string;
  contrato?: string;
  local?: string;
};

/** Logo no snapshot mobile: JPEG compacto (~120 KB) — suficiente para recibo no telemovel. */
export const LOGO_INSTITUCIONAL_SNAPSHOT_COMPRESS_OPTS: ImageCompressOptions = {
  maxEdgePx: 480,
  maxBytes: 120 * 1024,
  initialQuality: 0.88,
  minQuality: 0.55,
  scaleStep: 0.92,
};

const LOGO_SVG_SNAPSHOT_MAX_BYTES = 80 * 1024;

export function ehLogoInstitucionalPadraoFabrica(url: string): boolean {
  const u = url.trim().toLowerCase().replace(/\\/g, '/');
  if (!u) return true;
  return (
    u === LOGO_INSTITUCIONAL_PADRAO_FABRICA.toLowerCase() ||
    u === '/logo-institutional-default.svg' ||
    u.endsWith('/logo-institutional-default.svg')
  );
}

function ehSvgBlob(blob: Blob): boolean {
  const t = blob.type.toLowerCase();
  return t.includes('svg') || t === 'image/svg+xml';
}

/**
 * Comprime raster (PNG/JPG/WebP…) para JPEG leve. SVG pequeno passa intacto; SVG grande mantem-se sem rasterizar.
 */
export async function comprimirBlobLogoInstitucionalParaSnapshot(blob: Blob): Promise<string> {
  if (ehSvgBlob(blob)) {
    return blobToDataUrl(blob);
  }

  const file = new File([blob], 'logo-institucional', { type: blob.type || 'image/png' });
  const compressed = await compressImageFileToJpeg(file, LOGO_INSTITUCIONAL_SNAPSHOT_COMPRESS_OPTS);
  if (!compressed) {
    return blobToDataUrl(blob);
  }
  return blobToDataUrl(compressed.blob);
}

/**
 * Prepara ficheiro de logo: recorta margens brancas/transparentes (ex. PNG quadrado com padding)
 * e, se raster, comprime para JPEG leve. SVG passa intacto.
 */
export async function comprimirArquivoLogoInstitucionalParaArmazenamento(
  file: File,
): Promise<{ dataUrl: string; compressed: boolean; recortou: boolean } | null> {
  if (!file.type.startsWith('image/')) return null;
  if (ehSvgBlob(file)) {
    const dataUrl = await blobToDataUrl(file);
    return { dataUrl, compressed: false, recortou: false };
  }

  const { processarArquivoLogoInstitucionalComRecorte } = await import(
    '../../../lib/logoInstitucionalAjuste'
  );
  const processado = await processarArquivoLogoInstitucionalComRecorte(file, blobToDataUrl);
  if (!processado) return null;

  // Após recorte, comprimir o resultado (não o ficheiro original com margem).
  try {
    const blob = await dataUrlToBlob(processado.dataUrl);
    const asFile = new File([blob], file.name || 'logo.png', { type: blob.type || 'image/png' });
    const compressed = await compressImageFileToJpeg(asFile, LOGO_INSTITUCIONAL_SNAPSHOT_COMPRESS_OPTS);
    if (compressed) {
      return {
        dataUrl: await blobToDataUrl(compressed.blob),
        compressed: true,
        recortou: processado.recortou,
      };
    }
  } catch {
    /* usa PNG recortado */
  }

  return {
    dataUrl: processado.dataUrl,
    compressed: false,
    recortou: processado.recortou,
  };
}

async function comprimirDataUrlLogoParaSnapshotMobile(dataUrl: string): Promise<string> {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    if (ehSvgBlob(blob) && blob.size <= LOGO_SVG_SNAPSHOT_MAX_BYTES) {
      return dataUrl;
    }
    return await comprimirBlobLogoInstitucionalParaSnapshot(blob);
  } catch {
    return dataUrl;
  }
}

/**
 * Normaliza o logo para o snapshot mobile: converte caminhos relativos, comprime raster,
 * mantem https externo; padrao de fabrica mantem o marcador.
 */
export async function normalizarLogoInstitucionalParaSnapshotMobile(logoUrl: string): Promise<string> {
  const url = logoUrl.trim();
  if (!url || ehLogoInstitucionalPadraoFabrica(url)) {
    return LOGO_INSTITUCIONAL_PADRAO_FABRICA;
  }
  if (url.startsWith('data:')) {
    return comprimirDataUrlLogoParaSnapshotMobile(url);
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (typeof window === 'undefined') {
    return LOGO_INSTITUCIONAL_PADRAO_FABRICA;
  }
  try {
    const abs = absolutizarUrlMidiaParaDocumentoHtmlBlob(url);
    const res = await fetch(abs);
    if (!res.ok) return LOGO_INSTITUCIONAL_PADRAO_FABRICA;
    return await comprimirBlobLogoInstitucionalParaSnapshot(await res.blob());
  } catch {
    return LOGO_INSTITUCIONAL_PADRAO_FABRICA;
  }
}

export function extrairConfigReciboMobileParaSnapshot(
  config: Pick<
    ConfiguracaoSistema,
    'documentoRodapeNome' | 'documentoRodapeCnpj' | 'cliente' | 'projeto' | 'contrato' | 'local'
  >,
  logoInstitucionalUrlSnapshot: string,
): ConfigReciboMobileSnapshot {
  return {
    logoInstitucionalUrl: logoInstitucionalUrlSnapshot,
    documentoRodapeNome: config.documentoRodapeNome.trim(),
    documentoRodapeCnpj: config.documentoRodapeCnpj.trim(),
    cliente: config.cliente.trim(),
    projeto: config.projeto.trim(),
    contrato: config.contrato.trim(),
    local: config.local.trim(),
  };
}

/** Logo personalizado gravado localmente (nao e o marcador de fabrica). */
export function logoInstitucionalLocalConfigurado(url: string): boolean {
  const t = url.trim();
  return Boolean(t && !ehLogoInstitucionalPadraoFabrica(t));
}

/**
 * Verifica se logo/CNPJ/dados de projeto locais ainda nao constam no snapshot na nuvem
 * (utilizadores que configuraram antes da sync automatica).
 */
export function reciboConfigLocalPendenteEnvioNuvem(
  config: Pick<
    ConfiguracaoSistema,
    'logoInstitucionalUrl' | 'documentoRodapeCnpj' | 'cliente' | 'projeto' | 'contrato' | 'local'
  >,
  nuvem: ConfigReciboMobileSnapshot | undefined,
): boolean {
  const snap = nuvem ?? {};
  const logoNuvem = String(snap.logoInstitucionalUrl ?? '');
  const cnpjNuvem = String(snap.documentoRodapeCnpj ?? '').trim();
  const projetoNuvem = [snap.cliente, snap.projeto, snap.contrato, snap.local]
    .map((v) => String(v ?? '').trim())
    .some(Boolean);

  const logoLocal = logoInstitucionalLocalConfigurado(config.logoInstitucionalUrl);
  const cnpjLocal = config.documentoRodapeCnpj.trim();
  const projetoLocal = [config.cliente, config.projeto, config.contrato, config.local]
    .map((v) => v.trim())
    .some(Boolean);

  const logoPendente = logoLocal && ehLogoInstitucionalPadraoFabrica(logoNuvem);
  const cnpjPendente = Boolean(cnpjLocal) && cnpjLocal !== cnpjNuvem;
  const projetoPendente = projetoLocal && !projetoNuvem;

  return logoPendente || cnpjPendente || projetoPendente;
}
