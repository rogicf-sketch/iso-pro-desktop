/** Tokens visuais partilhados: pdf-lib + preview HTML (INS-01). */
export const RIR_PDF_THEME = {
  colors: {
    ink: '#0f172a',
    muted: '#64748b',
    blue: '#2563eb',
    blueLight: '#dbeafe',
    blueHead: '#eef2ff',
    border: '#e2e8f0',
    rowAlt: '#f8fafc',
    gridBg: '#f8fafc',
    green: '#166534',
    greenBg: '#dcfce7',
    greenBorder: '#bbf7d0',
    yellowBg: '#fefce8',
    yellowBorder: '#fde047',
    white: '#ffffff',
    badgeInk: '#1e40af',
  },
  logo: { maxWidthPx: 150, maxHeightPx: 76 },
  radius: { sm: 6, md: 8, pill: 999 },
  fontFamily: "'Segoe UI', 'Noto Sans', system-ui, sans-serif",
} as const;

export const RIR_PDF_TIPO_CSS = {
  titulo: '14px',
  codigoRir: '14px',
  meta: '9.5px',
  badge: '9px',
  gridLabel: '9px',
  gridValor: '10.5px',
  tag: '9.5px',
  secao: '10px',
  th: '10px',
  td: '10px',
  cert: '8.5px',
  folha: '9.5px',
} as const;

export function cssPreviewRirPdfTheme(): string {
  return `
@font-face {
  font-family: 'Noto Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/noto-sans-regular.woff') format('woff');
}
@font-face {
  font-family: 'Noto Sans';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('./fonts/noto-sans-bold.woff') format('woff');
}
`;
}
