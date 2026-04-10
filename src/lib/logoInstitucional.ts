import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from './logoInstitucional.constants';
import { readConfiguracoes } from '../modules/configuracoes/services/configuracoes.service';

/** Chave legada em `localStorage` (antes do campo em Configuracoes). */
export const LEGACY_LOGO_STORAGE_KEY = 'iso-pro-desktop-recibo-logo-url';

/**
 * URL do logo institucional para relatorios impressos (recibo, RIR, RNC, etiquetas, etc.).
 * Aceita caminho em `public`, URL absoluta ou `data:image/...` (upload em Configuracoes).
 * Ordem: override explicito > Configuracoes > localStorage legado > vazio.
 */
export function resolverUrlLogoInstitucional(override?: string | null): string {
  const explicit = override?.trim();
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const fromConfig = readConfiguracoes().logoInstitucionalUrl?.trim();
    if (fromConfig) return fromConfig;
    const stored = localStorage.getItem(LEGACY_LOGO_STORAGE_KEY)?.trim();
    if (stored) return stored;
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
  const { protocol, origin } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return t;
  if (t.startsWith('/')) return `${origin}${t}`;
  try {
    return new URL(t, `${origin}/`).href;
  } catch {
    return t;
  }
}

/** Mesma resolucao que {@link resolverUrlLogoInstitucional}, com URL pronta para HTML em `blob:` (impressao). */
export function resolverUrlLogoInstitucionalParaHtmlImpresso(override?: string | null): string {
  return absolutizarUrlMidiaParaDocumentoHtmlBlob(resolverUrlLogoInstitucional(override));
}
