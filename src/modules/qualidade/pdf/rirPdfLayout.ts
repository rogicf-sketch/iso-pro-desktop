import type { PDFFont } from 'pdf-lib';
import { quebrarTextoPdf } from './rirPdfText';

/** A4 em pontos (72 pt = 1 pol). */
export const RIR_PDF_PAGE = { w: 595.28, h: 841.89 } as const;

export const RIR_PDF_MARGIN = { top: 28, right: 28, bottom: 32, left: 28 } as const;

export const RIR_PDF_COLS = {
  item: 0.034,
  cod: 0.178,
  q: 0.058,
  u: 0.044,
  desc: 0.584,
  cert: 0.102,
} as const;

export { RIR_PDF_VERSION } from './rirPdfMetadata';

/** Alturas fixas (pt) para orçamento de paginação — devem coincidir com o desenho real. */
export const RIR_PDF_HEADER_FIRST_H = 298;
/** Faixa titulo INS (logo + titulo + codigo + badge + meta) — repetida em todas as folhas. */
export const RIR_PDF_TITLE_BAND_H = 114;
/** Folhas 2+: faixa titulo + linha separadora. */
export const RIR_PDF_HEADER_CONT_H = 122;
export const RIR_PDF_TABLE_HEAD_H = 36;
/** Rodapé com numeração «Folha 1/3» em todas as folhas. */
export const RIR_PDF_FOLHA_H = 22;
export const RIR_PDF_FOOTER_BLOCK_H = 218;

/** Altura de linha da tabela de itens (medir + desenhar devem coincidir). */
export const RIR_PDF_TABLE_LINE_H = 12;

/** Tipografia alinhada ao recibo de atendimento (body 11pt, tabela 10pt, info 10.5pt). */
export const RIR_PDF_TIPO = {
  titulo: 11,
  codigoRir: 10.5,
  meta: 9.5,
  badge: 9,
  gridLabel: 9,
  gridValor: 10.5,
  tag: 9.5,
  secao: 10,
  th: 10,
  td: 10,
  cert: 8.5,
  folha: 9.5,
} as const;

/** Logo institucional — igual recibo (.inst-logo-img 150×76). */
export const RIR_PDF_LOGO_MAX = { w: 150, h: 76 } as const;

/** Logo compacto folhas 2+ (mesma proporção ~75% do cabeçalho). */
export const RIR_PDF_LOGO_CONT_MAX = { w: 112, h: 38 } as const;

export const RIR_PDF_COLORS = {
  ink: { r: 0.06, g: 0.09, b: 0.16 },
  muted: { r: 0.39, g: 0.45, b: 0.55 },
  blue: { r: 0.15, g: 0.39, b: 0.92 },
  blueLight: { r: 0.86, g: 0.92, b: 0.99 },
  border: { r: 0.89, g: 0.91, b: 0.94 },
  rowAlt: { r: 0.97, g: 0.98, b: 0.99 },
  green: { r: 0.09, g: 0.64, b: 0.29 },
  greenBg: { r: 0.86, g: 0.99, b: 0.91 },
  yellowBg: { r: 1, g: 0.99, b: 0.91 },
  yellowBorder: { r: 0.99, g: 0.88, b: 0.28 },
  white: { r: 1, g: 1, b: 1 },
} as const;

export type RirPdfRowLayout = {
  index: number;
  height: number;
  descLines: string[];
  codLines: string[];
};

export function larguraConteudoPdf(): number {
  return RIR_PDF_PAGE.w - RIR_PDF_MARGIN.left - RIR_PDF_MARGIN.right;
}

export function largurasColunasPdf(): Record<keyof typeof RIR_PDF_COLS, number> {
  const w = larguraConteudoPdf();
  return {
    item: w * RIR_PDF_COLS.item,
    cod: w * RIR_PDF_COLS.cod,
    q: w * RIR_PDF_COLS.q,
    u: w * RIR_PDF_COLS.u,
    desc: w * RIR_PDF_COLS.desc,
    cert: w * RIR_PDF_COLS.cert,
  };
}

export function medirLinhaTabelaRir(params: {
  codigo: string;
  descricao: string;
  fontRegular: PDFFont;
  fontSize: number;
  lineHeight: number;
  padY: number;
}): Omit<RirPdfRowLayout, 'index'> {
  const cols = largurasColunasPdf();
  const pad = 4;
  const codLines = quebrarTextoPdf(params.codigo, cols.cod - pad, params.fontRegular, params.fontSize - 0.5);
  const descLines = quebrarTextoPdf(params.descricao, cols.desc - pad, params.fontRegular, params.fontSize - 0.5);
  const lineCount = Math.max(codLines.length, descLines.length, 1);
  const height = lineCount * params.lineHeight + params.padY * 2;
  return { height, descLines, codLines };
}

/** Pagina linhas por altura disponivel (pt). Cria novas folhas quando o orcamento acaba. */
export function paginarLinhasPorAltura(
  rows: RirPdfRowLayout[],
  budgets: number[],
): number[][] {
  if (rows.length === 0) return [[]];

  const pages: number[][] = [];
  let rowIdx = 0;
  let budgetIdx = 0;
  let lastBudget = budgets[budgets.length - 1] ?? budgets[0] ?? 400;

  while (rowIdx < rows.length) {
    const budget = budgets[budgetIdx] ?? lastBudget;
    if (budgetIdx < budgets.length) lastBudget = budget;

    const pageRows: number[] = [];
    let used = 0;

    while (rowIdx < rows.length) {
      const h = rows[rowIdx]!.height;
      if (pageRows.length > 0 && used + h > budget) break;
      pageRows.push(rowIdx);
      used += h;
      rowIdx++;
    }

    pages.push(pageRows);
    budgetIdx++;
  }

  return pages.filter((p) => p.length > 0);
}

/** Calcula orcamentos de altura (pt) para linhas da tabela por folha. */
export function calcularOrcamentosTabelaRir(params: {
  headerPrimeira: number;
  headerContinuacao: number;
  tableHead: number;
  footer: number;
  folhaNum?: number;
  pageCountEstimate: number;
}): number[] {
  const folha = params.folhaNum ?? RIR_PDF_FOLHA_H;
  const usable = (primeira: boolean, ultima: boolean) => {
    const header = primeira ? params.headerPrimeira : params.headerContinuacao;
    const foot = ultima ? params.footer : 0;
    return RIR_PDF_PAGE.h - RIR_PDF_MARGIN.top - RIR_PDF_MARGIN.bottom - header - params.tableHead - foot - folha;
  };

  if (params.pageCountEstimate <= 1) {
    return [usable(true, true)];
  }

  const budgets: number[] = [usable(true, false)];
  for (let i = 1; i < params.pageCountEstimate - 1; i++) {
    budgets.push(usable(false, false));
  }
  budgets.push(usable(false, true));
  return budgets;
}

/** Estima quantas folhas sao necessarias (iteracao rapida). */
export function estimarPaginasRir(rows: RirPdfRowLayout[], footer: number, tableHead: number): number {
  let pages = 1;
  const maxIter = 20;
  for (let iter = 0; iter < maxIter; iter++) {
    const budgets = calcularOrcamentosTabelaRir({
      headerPrimeira: RIR_PDF_HEADER_FIRST_H,
      headerContinuacao: RIR_PDF_HEADER_CONT_H,
      tableHead,
      footer,
      pageCountEstimate: pages,
    });
    const packed = paginarLinhasPorAltura(rows, budgets);
    if (packed.length <= pages) return Math.max(1, packed.length);
    pages = packed.length;
  }
  return pages;
}
