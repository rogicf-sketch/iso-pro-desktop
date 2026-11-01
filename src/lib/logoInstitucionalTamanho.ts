/**
 * Quadro do logo institucional nos relatórios.
 * Formato (horizontal / quadrado / vertical) + escala; «auto» escolhe o formato pela proporção da imagem.
 */

export const LOGO_INSTITUCIONAL_TAMANHOS = ['auto', 'compacto', 'padrao', 'grande'] as const;
export type LogoInstitucionalTamanhoRelatorio = (typeof LOGO_INSTITUCIONAL_TAMANHOS)[number];

export const LOGO_INSTITUCIONAL_FORMATOS = ['auto', 'horizontal', 'quadrado', 'vertical'] as const;
export type LogoInstitucionalFormatoQuadro = (typeof LOGO_INSTITUCIONAL_FORMATOS)[number];

export const LOGO_INSTITUCIONAL_TAMANHO_PADRAO: LogoInstitucionalTamanhoRelatorio = 'auto';
export const LOGO_INSTITUCIONAL_FORMATO_PADRAO: LogoInstitucionalFormatoQuadro = 'auto';

/** Bases do quadro (px) — a escala multiplica. */
const SLOT_FORMATO: Record<Exclude<LogoInstitucionalFormatoQuadro, 'auto'>, { w: number; h: number }> = {
  horizontal: { w: 190, h: 72 },
  quadrado: { w: 96, h: 96 },
  vertical: { w: 78, h: 112 },
};

const ESCALA: Record<LogoInstitucionalTamanhoRelatorio, number> = {
  auto: 1,
  compacto: 0.84,
  padrao: 1,
  grande: 1.2,
};

export function normalizarLogoInstitucionalTamanho(
  raw: unknown,
): LogoInstitucionalTamanhoRelatorio {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((LOGO_INSTITUCIONAL_TAMANHOS as readonly string[]).includes(t)) {
    return t as LogoInstitucionalTamanhoRelatorio;
  }
  return LOGO_INSTITUCIONAL_TAMANHO_PADRAO;
}

export function normalizarLogoInstitucionalFormato(
  raw: unknown,
): LogoInstitucionalFormatoQuadro {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase();
  if ((LOGO_INSTITUCIONAL_FORMATOS as readonly string[]).includes(t)) {
    return t as LogoInstitucionalFormatoQuadro;
  }
  return LOGO_INSTITUCIONAL_FORMATO_PADRAO;
}

/** Proporção largura/altura; inválido → horizontal (chapa típica). */
export function normalizarLogoInstitucionalAspecto(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0.2 || n > 8) return 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * Escolhe formato pela proporção (w/h).
 * ≥1.35 horizontal · ≤0.78 vertical · senão quadrado (caso TECHGEAR).
 */
export function formatoQuadroPelaProporcao(aspecto: number): Exclude<LogoInstitucionalFormatoQuadro, 'auto'> {
  if (aspecto >= 1.35) return 'horizontal';
  if (aspecto > 0 && aspecto <= 0.78) return 'vertical';
  if (aspecto > 0) return 'quadrado';
  return 'horizontal';
}

export type LogoSlotOpts = {
  tamanho?: LogoInstitucionalTamanhoRelatorio;
  formato?: LogoInstitucionalFormatoQuadro;
  /** w/h da imagem (após recorte). 0 = desconhecido → horizontal se formato auto. */
  aspecto?: number;
};

export function resolverFormatoQuadroEfetivo(opts: LogoSlotOpts = {}): Exclude<LogoInstitucionalFormatoQuadro, 'auto'> {
  const formato = normalizarLogoInstitucionalFormato(opts.formato);
  if (formato !== 'auto') return formato;
  return formatoQuadroPelaProporcao(normalizarLogoInstitucionalAspecto(opts.aspecto));
}

export function dimensoesLogoInstitucionalHtml(opts: LogoSlotOpts | LogoInstitucionalTamanhoRelatorio = {}): {
  w: number;
  h: number;
} {
  const o: LogoSlotOpts =
    typeof opts === 'string' ? { tamanho: opts } : opts ?? {};
  const formato = resolverFormatoQuadroEfetivo(o);
  const escala = ESCALA[normalizarLogoInstitucionalTamanho(o.tamanho)];
  const base = SLOT_FORMATO[formato];
  return {
    w: Math.max(48, Math.round(base.w * escala)),
    h: Math.max(48, Math.round(base.h * escala)),
  };
}

export function dimensoesLogoInstitucionalPdf(opts: LogoSlotOpts | LogoInstitucionalTamanhoRelatorio = {}): {
  w: number;
  h: number;
} {
  const d = dimensoesLogoInstitucionalHtml(opts);
  return { w: d.w, h: Math.round(d.h * 1.02) };
}

export function rotuloLogoInstitucionalTamanho(t: LogoInstitucionalTamanhoRelatorio): string {
  switch (t) {
    case 'auto':
      return 'Média (padrão)';
    case 'compacto':
      return 'Compacto';
    case 'padrao':
      return 'Média';
    case 'grande':
      return 'Grande';
    default:
      return 'Média (padrão)';
  }
}

export function rotuloLogoInstitucionalFormato(f: LogoInstitucionalFormatoQuadro): string {
  switch (f) {
    case 'auto':
      return 'Automático (pela proporção do logo)';
    case 'horizontal':
      return 'Horizontal (largo)';
    case 'quadrado':
      return 'Quadrado';
    case 'vertical':
      return 'Vertical (alto)';
    default:
      return 'Automático (pela proporção do logo)';
  }
}

/**
 * CSS partilhado: força o mesmo slot em RIR, RF, RNC, recibos e relatórios institucionais.
 */
export function cssLogoInstitucionalImpressao(
  tamanhoOuOpts: LogoInstitucionalTamanhoRelatorio | LogoSlotOpts = LOGO_INSTITUCIONAL_TAMANHO_PADRAO,
  zoomPct = 100,
): string {
  const opts: LogoSlotOpts =
    typeof tamanhoOuOpts === 'string' ? { tamanho: tamanhoOuOpts } : tamanhoOuOpts;
  const { w, h } = dimensoesLogoInstitucionalHtml(opts);
  const zoom = Math.max(0.8, Math.min(2.8, zoomPct / 100));
  return `
:root {
  --iso-logo-slot-w: ${w}px;
  --iso-logo-slot-h: ${h}px;
  --iso-logo-zoom: ${zoom};
}
.rir-logo-badge--img,
.rf-logo-badge--img,
.rnc-logo-badge--img,
.recibo-logo-badge--img {
  display: flex !important;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--iso-logo-slot-w);
  height: var(--iso-logo-slot-h);
  min-height: var(--iso-logo-slot-h);
  max-height: var(--iso-logo-slot-h);
  background: transparent !important;
  padding: 0 !important;
  box-shadow: none !important;
  overflow: hidden;
}
.rir-logo-img,
.rf-logo-img,
.rnc-logo-img,
.recibo-logo-img,
.inst-logo-img {
  display: block !important;
  width: auto !important;
  height: auto !important;
  max-width: 100% !important;
  max-height: 100% !important;
  object-fit: contain !important;
  object-position: center center !important;
  transform: scale(var(--iso-logo-zoom, 1));
  transform-origin: center center;
}
.rir-hdr-logo,
.rf-hdr-logo,
.rnc-hdr-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: var(--iso-logo-slot-w) !important;
}
.rir-logo-badge:not(.rir-logo-badge--img),
.rf-logo-badge:not(.rf-logo-badge--img),
.rnc-logo-badge:not(.rnc-logo-badge--img),
.recibo-logo-badge:not(.recibo-logo-badge--img) {
  margin-left: auto;
  margin-right: auto;
}
.inst-logo-col {
  flex: 0 0 var(--iso-logo-slot-w) !important;
  min-height: var(--iso-logo-slot-h) !important;
  display: flex;
  align-items: center;
  justify-content: center;
}
.inst-logo-col--pequeno {
  flex-basis: calc(var(--iso-logo-slot-w) * 0.68) !important;
  min-height: calc(var(--iso-logo-slot-h) * 0.68) !important;
}
.inst-logo-col--pequeno .inst-logo-img {
  max-width: calc(var(--iso-logo-slot-w) * 0.68) !important;
  max-height: calc(var(--iso-logo-slot-h) * 0.68) !important;
}
`;
}
