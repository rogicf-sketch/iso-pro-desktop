import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from './logoInstitucional.constants';
import { readConfiguracoes } from '../modules/configuracoes/services/configuracoes.service';
import {
  LOGO_ZOOM_PCT_FABRICA,
  LOGO_ZOOM_PCT_PADRAO,
  normalizarLogoInstitucionalZoomPct,
} from './logoInstitucionalAjuste';
import {
  cssLogoInstitucionalImpressao,
  LOGO_INSTITUCIONAL_FORMATO_PADRAO,
  LOGO_INSTITUCIONAL_TAMANHO_PADRAO,
  normalizarLogoInstitucionalAspecto,
  normalizarLogoInstitucionalFormato,
  normalizarLogoInstitucionalTamanho,
  type LogoInstitucionalFormatoQuadro,
  type LogoInstitucionalTamanhoRelatorio,
} from './logoInstitucionalTamanho';

function ehUrlLogoFabrica(url: string): boolean {
  const u = url.trim().toLowerCase().replace(/\\/g, '/');
  if (!u) return true;
  return (
    u === LOGO_INSTITUCIONAL_PADRAO_FABRICA.toLowerCase() ||
    u === '/logo-institutional-default.svg' ||
    u.endsWith('/logo-institutional-default.svg') ||
    u.includes('logo-institutional-default') ||
    u.includes('logo-institutional-print')
  );
}

/** Base da chave legada em `localStorage` (antes do campo em Configuracoes); o valor efectivo é scoped por ambiente. */
export const LEGACY_LOGO_STORAGE_KEY_BASE = 'iso-pro-desktop-recibo-logo-url';

/** @deprecated Use {@link LEGACY_LOGO_STORAGE_KEY_BASE} ou `getScopedIsoProStorageKey(LEGACY_LOGO_STORAGE_KEY_BASE)`. */
export const LEGACY_LOGO_STORAGE_KEY = LEGACY_LOGO_STORAGE_KEY_BASE;

/**
 * URL do logo institucional para relatorios impressos (recibo, RIR, RNC, etiquetas, etc.).
 * Aceita caminho em `public`, URL absoluta ou `data:image/...` (upload em Configuracoes).
 * Ordem: override explicito > Configuracoes > logo padrao de fabrica.
 */
export function resolverUrlLogoInstitucional(override?: string | null): string {
  const explicit = override?.trim();
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const fromConfig = readConfiguracoes().logoInstitucionalUrl?.trim();
    if (fromConfig) return fromConfig;
  }
  return LOGO_INSTITUCIONAL_PADRAO_FABRICA;
}

/**
 * Janelas de impressao abrem HTML via `blob:` — caminhos tipo `/logo.svg` nao resolvem.
 * Converte para URL absoluta em http(s) para o `<img src>` carregar.
 */
export function absolutizarUrlMidiaParaDocumentoHtmlBlob(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (t.startsWith('data:')) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (typeof window === 'undefined') return t;
  const { protocol } = window.location;
  try {
    if (protocol === 'file:') {
      // Com `file://`, um src `/logo.svg` vira `file:///logo.svg` (raiz do disco) e falha.
      // Assets em `public/` ficam ao lado do `index.html` (Vite `base: './'`).
      const rel = t.startsWith('/') ? `./${t.slice(1)}` : t;
      return new URL(rel, window.location.href).href;
    }
    return new URL(t, window.location.href).href;
  } catch {
    return t;
  }
}

/** Alias usado na UI de Configuracoes (preview do logo em `public/`). */
export const normalizarUrlAssetPublicParaAmbiente = absolutizarUrlMidiaParaDocumentoHtmlBlob;

/** Mesma resolucao que {@link resolverUrlLogoInstitucional}, com URL pronta para HTML em `blob:` (impressao). */
export function resolverUrlLogoInstitucionalParaHtmlImpresso(override?: string | null): string {
  return absolutizarUrlMidiaParaDocumentoHtmlBlob(resolverUrlLogoInstitucional(override));
}

/** Escala do quadro (Configurações → Interface). */
export function lerTamanhoLogoInstitucionalConfig(): LogoInstitucionalTamanhoRelatorio {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return LOGO_INSTITUCIONAL_TAMANHO_PADRAO;
    }
    return normalizarLogoInstitucionalTamanho(readConfiguracoes().logoInstitucionalTamanhoRelatorio);
  } catch {
    return LOGO_INSTITUCIONAL_TAMANHO_PADRAO;
  }
}

export function lerFormatoLogoInstitucionalConfig(): LogoInstitucionalFormatoQuadro {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return LOGO_INSTITUCIONAL_FORMATO_PADRAO;
    }
    return normalizarLogoInstitucionalFormato(readConfiguracoes().logoInstitucionalFormatoQuadro);
  } catch {
    return LOGO_INSTITUCIONAL_FORMATO_PADRAO;
  }
}

export function lerAspectoLogoInstitucionalConfig(): number {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return 0;
    }
    return normalizarLogoInstitucionalAspecto(readConfiguracoes().logoInstitucionalAspecto);
  } catch {
    return 0;
  }
}

export function lerZoomLogoInstitucionalConfig(): number {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return LOGO_ZOOM_PCT_PADRAO;
    }
    return normalizarLogoInstitucionalZoomPct(readConfiguracoes().logoInstitucionalZoomPct);
  } catch {
    return LOGO_ZOOM_PCT_PADRAO;
  }
}

/** CSS do slot de logo — incluir em todos os HTML de impressão. */
export function cssLogoInstitucionalImpressaoDaConfig(): string {
  let zoom = lerZoomLogoInstitucionalConfig();
  let aspecto = lerAspectoLogoInstitucionalConfig();
  let formato = lerFormatoLogoInstitucionalConfig();
  try {
    if (ehUrlLogoFabrica(readConfiguracoes().logoInstitucionalUrl ?? '')) {
      zoom = LOGO_ZOOM_PCT_FABRICA;
      // Chapa I.S.O PRO é horizontal larga.
      formato = 'horizontal';
      aspecto = 2.4;
    }
  } catch {
    /* mantém valores lidos */
  }
  return cssLogoInstitucionalImpressao(
    {
      tamanho: lerTamanhoLogoInstitucionalConfig(),
      formato,
      aspecto,
    },
    zoom,
  );
}
