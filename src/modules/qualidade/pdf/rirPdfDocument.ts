/** @deprecated Motor legado pdf-lib — RIR oficial usa HTML + Chromium (`imprimirRirPdf.ts`). */
import { PDFDocument, PDFPage, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import type { RirItemLinha, RirLaudo, RirRegistro } from '../types/qualidade.types';
import {
  RIR_PDF_COLORS,
  RIR_PDF_MARGIN,
  RIR_PDF_PAGE,
  RIR_PDF_HEADER_FIRST_H,
  RIR_PDF_HEADER_CONT_H,
  RIR_PDF_TABLE_HEAD_H,
  RIR_PDF_FOOTER_BLOCK_H,
  calcularOrcamentosTabelaRir,
  larguraConteudoPdf,
  largurasColunasPdf,
  medirLinhaTabelaRir,
  paginarLinhasPorAltura,
  estimarPaginasRir,
  type RirPdfRowLayout,
} from './rirPdfLayout';
import { formatDatePtPdf, sanitizarTextoPdf } from './rirPdfText';
import {
  desenharBarraLateral,
  desenharPill,
  desenharRetanguloArredondado,
  encaixarImagemPdf,
} from './rirPdfDraw';
import { incorporarFontesRirPdf } from './rirPdfFonts';
import { aplicarMetadadosRirPdf, RIR_PDF_VERSION } from './rirPdfMetadata';
import { RIR_PDF_LAYOUT } from './rirPdfMarkers';
import {
  RIR_PDF_LOGO_MAX,
  RIR_PDF_TABLE_LINE_H,
  RIR_PDF_TIPO,
  RIR_PDF_TITLE_BAND_H,
  RIR_PDF_FOLHA_H,
} from './rirPdfLayout';

export type RirPdfBranding = {
  logoPng?: Uint8Array;
  logoJpg?: Uint8Array;
  cliente: string;
  projeto: string;
  rodapeInstituicao?: string;
};

export type RirPdfContexto = {
  registro: RirRegistro;
  branding: RirPdfBranding;
  uoExibir: string;
  localExibir: string;
  contratoExibir: string;
  disciplinaExibir: string;
  escopoLinha: string;
  emitidoEm: string;
  logoDataUrl?: string;
  fonteFamilia?: string;
};

const FOOTER_BLOCK_H = RIR_PDF_FOOTER_BLOCK_H;
const TABLE_HEAD_H = RIR_PDF_TABLE_HEAD_H;
const HEADER_FIRST_H = RIR_PDF_HEADER_FIRST_H;
const HEADER_CONT_H = RIR_PDF_HEADER_CONT_H;

function laudoLabel(l: RirLaudo): string {
  if (l === 'reprovado') return 'REPROVADO';
  if (l === 'observacoes') return 'CONFORME OBSERVAÇÕES';
  return 'APROVADO';
}

function laudoColor(l: RirLaudo) {
  if (l === 'reprovado') return rgb(0.86, 0.15, 0.15);
  if (l === 'observacoes') return rgb(0.85, 0.47, 0.02);
  return rgb(RIR_PDF_COLORS.green.r, RIR_PDF_COLORS.green.g, RIR_PDF_COLORS.green.b);
}

function statusLabel(s: RirRegistro['status']): string {
  const m: Record<RirRegistro['status'], string> = {
    aberto: 'Em aberto',
    em_analise: 'Em análise',
    tratado: 'Tratado',
    cancelado: 'Cancelado',
  };
  return m[s] ?? s;
}

function c(v: (typeof RIR_PDF_COLORS)[keyof typeof RIR_PDF_COLORS]) {
  return rgb(v.r, v.g, v.b);
}

export async function gerarRirPdfBytes(ctx: RirPdfContexto): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  aplicarMetadadosRirPdf(doc, ctx.registro.codigo);

  const { font, fontBold, familia } = await incorporarFontesRirPdf(doc);

  let logoImage: PDFImage | undefined;
  if (ctx.branding.logoPng?.length) {
    try {
      logoImage = await doc.embedPng(ctx.branding.logoPng);
    } catch {
      /* logo opcional */
    }
  } else if (ctx.branding.logoJpg?.length) {
    try {
      logoImage = await doc.embedJpg(ctx.branding.logoJpg);
    } catch {
      /* logo opcional */
    }
  }

  const itens = ctx.registro.itensRir ?? [];
  const rowLayouts: RirPdfRowLayout[] = itens.map((it, index) => ({
    index,
    ...medirLinhaTabelaRir({
      codigo: sanitizarTextoPdf(it.codigoMaterial),
      descricao: sanitizarTextoPdf(it.descricaoMaterial),
      fontRegular: font,
      fontSize: RIR_PDF_TIPO.td,
      lineHeight: RIR_PDF_TABLE_LINE_H,
      padY: 4,
    }),
  }));

  const pageCount = estimarPaginasRir(rowLayouts, FOOTER_BLOCK_H, TABLE_HEAD_H);
  const budgets = calcularOrcamentosTabelaRir({
    headerPrimeira: HEADER_FIRST_H,
    headerContinuacao: HEADER_CONT_H,
    tableHead: TABLE_HEAD_H,
    footer: FOOTER_BLOCK_H,
    pageCountEstimate: pageCount,
  });
  const pagesRows = paginarLinhasPorAltura(rowLayouts, budgets);
  const totalPages = Math.max(1, pagesRows.length);

  const pages: PDFPage[] = [];
  const fonteLabel = familia;

  for (let p = 0; p < totalPages; p++) {
    const page = doc.addPage([RIR_PDF_PAGE.w, RIR_PDF_PAGE.h]);
    pages.push(page);
    const isFirst = p === 0;
    const isLast = p === totalPages - 1;
    let y = RIR_PDF_PAGE.h - RIR_PDF_MARGIN.top;

    y = isFirst
      ? desenharCabecalhoPrimeiraPagina(page, ctx, {
          font,
          fontBold,
          logoImage,
          y,
          pageNum: p + 1,
          pageTotal: totalPages,
        })
      : desenharCabecalhoContinuacao(page, ctx, {
          font,
          fontBold,
          logoImage,
          y,
          pageNum: p + 1,
          pageTotal: totalPages,
        });

    y -= 2;
    y = desenharCabecalhoTabela(page, fontBold, y, !isFirst);

    const rowIndexes = pagesRows[p] ?? [];
    for (let ri = 0; ri < rowIndexes.length; ri++) {
      const layout = rowLayouts[rowIndexes[ri]!]!;
      const item = itens[layout.index]!;
      y = desenharLinhaTabela(page, {
        font,
        fontBold,
        item,
        layout,
        y,
        stripe: ri % 2 === 1,
        itemNum: layout.index + 1,
      });
    }

    desenharNumeracaoFolhaRodape(page, font, p + 1, totalPages);

    if (isLast) {
      desenharRodape(page, ctx, font, fontBold, fonteLabel);
    }
  }

  return doc.save();
}

function desenharFaixaTituloInstitucionalRir(
  page: PDFPage,
  ctx: RirPdfContexto,
  opts: {
    font: PDFFont;
    fontBold: PDFFont;
    logoImage?: PDFImage;
    y: number;
    pageNum: number;
    pageTotal: number;
  },
): number {
  const { font, fontBold, logoImage } = opts;
  let y = opts.y;
  const x0 = RIR_PDF_MARGIN.left;
  const contentW = larguraConteudoPdf();
  const hdrBottom = y - RIR_PDF_TITLE_BAND_H;

  const zone = zonaTituloCentralRir(x0, contentW);

  if (logoImage) {
    const dims = encaixarImagemPdf(logoImage, RIR_PDF_LOGO_MAX.w, RIR_PDF_LOGO_MAX.h);
    page.drawImage(logoImage, {
      x: x0,
      y: hdrBottom + (RIR_PDF_LOGO_MAX.h - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  } else {
    desenharLogoFallback(page, fontBold, x0, hdrBottom + 2);
  }

  desenharTituloRir(page, fontBold, zone, y);
  desenharCodigoCentralRir(page, fontBold, zone, y, ctx.registro.codigo);
  desenharBadgeEscopo(page, font, zone, y - 32, ctx.escopoLinha);
  desenharMetaRir(page, font, fontBold, x0, contentW, y, ctx.registro, ctx.emitidoEm);

  y = hdrBottom - 4;
  return desenharLinhaCabecalho(page, x0, contentW, y);
}

function desenharCabecalhoPrimeiraPagina(
  page: PDFPage,
  ctx: RirPdfContexto,
  opts: {
    font: PDFFont;
    fontBold: PDFFont;
    logoImage?: PDFImage;
    y: number;
    pageNum: number;
    pageTotal: number;
  },
): number {
  let y = desenharFaixaTituloInstitucionalRir(page, ctx, opts);
  y = desenharGradeInfo(page, ctx, opts.fontBold, y);
  y = desenharTagsInspecao(page, ctx.registro, opts.fontBold, y);
  return y;
}

/** Folhas 2+ — mesma faixa titulo INS da folha 1 (sem grade/tags). */
function desenharCabecalhoContinuacao(
  page: PDFPage,
  ctx: RirPdfContexto,
  opts: {
    font: PDFFont;
    fontBold: PDFFont;
    logoImage?: PDFImage;
    y: number;
    pageNum: number;
    pageTotal: number;
  },
): number {
  return desenharFaixaTituloInstitucionalRir(page, ctx, opts);
}

function desenharLogoFallback(
  page: PDFPage,
  fontBold: PDFFont,
  x0: number,
  yBottom: number,
  badgeW = 150,
  badgeH = 76,
  radius = 6,
): void {
  desenharRetanguloArredondado(page, x0, yBottom, badgeW, badgeH, radius, {
    fill: c(RIR_PDF_COLORS.ink),
  });
  page.drawText('I · S · O | PRO', {
    x: x0 + 10,
    y: yBottom + 48,
    size: 11,
    font: fontBold,
    color: c(RIR_PDF_COLORS.white),
  });
  page.drawText('GESTÃO DE MATERIAIS', {
    x: x0 + 10,
    y: yBottom + 22,
    size: 8,
    font: fontBold,
    color: c(RIR_PDF_COLORS.green),
  });
}

/** Área central do título (entre logo à esquerda e meta/código à direita). */
function zonaTituloCentralRir(x0: number, contentW: number): { x: number; w: number } {
  const logoW = RIR_PDF_LOGO_MAX.w + 14;
  const metaW = 138;
  const zx = x0 + logoW;
  const zw = Math.max(160, contentW - logoW - metaW);
  return { x: zx, w: zw };
}

function desenharTituloRir(
  page: PDFPage,
  fontBold: PDFFont,
  zone: { x: number; w: number },
  y: number,
): void {
  const title = 'RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO';
  const titleSize = RIR_PDF_TIPO.titulo;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: zone.x + Math.max(0, (zone.w - titleW) / 2),
    y: y - 2,
    size: titleSize,
    font: fontBold,
    color: c(RIR_PDF_COLORS.ink),
  });
}

/** Código RIR centrado abaixo do título (modelo RIR-INS). */
function desenharCodigoCentralRir(
  page: PDFPage,
  fontBold: PDFFont,
  zone: { x: number; w: number },
  y: number,
  codigo: string,
): void {
  const codSize = RIR_PDF_TIPO.codigoRir;
  const txt = sanitizarTextoPdf(codigo);
  const tw = fontBold.widthOfTextAtSize(txt, codSize);
  page.drawText(txt, {
    x: zone.x + Math.max(0, (zone.w - tw) / 2),
    y: y - 16,
    size: codSize,
    font: fontBold,
    color: c(RIR_PDF_COLORS.blue),
  });
}

function desenharBadgeEscopo(
  page: PDFPage,
  font: PDFFont,
  zone: { x: number; w: number },
  y: number,
  escopo: string,
): void {
  const badgeRaw = sanitizarTextoPdf(`RIR · ${escopo}`);
  const badge = badgeRaw.length > 68 ? `${badgeRaw.slice(0, 65)}...` : badgeRaw;
  const badgeSize = RIR_PDF_TIPO.badge;
  const badgeH = 18;
  const badgeW = Math.min(font.widthOfTextAtSize(badge, badgeSize) + 18, zone.w);
  const badgeX = zone.x + (zone.w - badgeW) / 2;
  desenharPill(page, badgeX, y - 20, badgeW, badgeH, {
    fill: c(RIR_PDF_COLORS.blueLight),
  });
  page.drawText(badge, {
    x: badgeX + 9,
    y: y - 15,
    size: badgeSize,
    font,
    color: c(RIR_PDF_COLORS.blue),
  });
}

function desenharMetaRir(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  x0: number,
  contentW: number,
  y: number,
  r: RirRegistro,
  emitidoEm: string,
): void {
  const metaX = x0 + contentW - 132;
  page.drawText(sanitizarTextoPdf(r.codigo), {
    x: metaX,
    y: y - 2,
    size: RIR_PDF_TIPO.codigoRir,
    font: fontBold,
    color: c(RIR_PDF_COLORS.blue),
  });
  page.drawText(`Data: ${formatDatePtPdf(r.dataRegistro)}`, {
    x: metaX,
    y: y - 16,
    size: RIR_PDF_TIPO.meta,
    font,
    color: c(RIR_PDF_COLORS.muted),
  });
  page.drawText(`Emitido: ${emitidoEm}`, {
    x: metaX,
    y: y - 28,
    size: RIR_PDF_TIPO.meta,
    font,
    color: c(RIR_PDF_COLORS.muted),
  });
}

/** Numeração no rodapé direito: Folha 1/3 (todas as folhas). */
function desenharNumeracaoFolhaRodape(
  page: PDFPage,
  font: PDFFont,
  pageNum: number,
  pageTotal: number,
): void {
  const x0 = RIR_PDF_MARGIN.left;
  const contentW = larguraConteudoPdf();
  const baseY = RIR_PDF_MARGIN.bottom;
  const folhaTxt = `Folha ${pageNum}/${pageTotal}`;
  const folhaSize = RIR_PDF_TIPO.folha;
  const tw = font.widthOfTextAtSize(folhaTxt, folhaSize);

  page.drawLine({
    start: { x: x0, y: baseY + RIR_PDF_FOLHA_H - 6 },
    end: { x: x0 + contentW, y: baseY + RIR_PDF_FOLHA_H - 6 },
    thickness: 0.45,
    color: c(RIR_PDF_COLORS.border),
  });

  page.drawText(folhaTxt, {
    x: x0 + contentW - tw,
    y: baseY + 8,
    size: folhaSize,
    font,
    color: c(RIR_PDF_COLORS.muted),
  });
}

function desenharLinhaCabecalho(page: PDFPage, x0: number, contentW: number, y: number): number {
  page.drawLine({
    start: { x: x0, y },
    end: { x: x0 + contentW, y },
    thickness: 2.5,
    color: c(RIR_PDF_COLORS.blueLight),
  });
  return y - 10;
}

function desenharGradeInfo(page: PDFPage, ctx: RirPdfContexto, fontBold: PDFFont, y: number): number {
  const x0 = RIR_PDF_MARGIN.left;
  const contentW = larguraConteudoPdf();
  const colW = contentW / 3;
  const pad = 10;
  const r = ctx.registro;
  const rows: [string, string][] = [
    ['UO (Obra/Depto)', ctx.uoExibir || '-'],
    ['Nota Fiscal', r.recebimentoNotaFiscal ?? '-'],
    ['Nº Procedimento', r.procedimentoNumero || '-'],
    ['Local', ctx.localExibir || '-'],
    ['Fornecedor', r.fornecedorNome || '-'],
    ['Romaneio', r.recebimentoRomaneio ?? '-'],
    ['Contrato', ctx.contratoExibir || '-'],
    ['Sol. compra / Pack-list', (r.solCompraPackList ?? '').trim() || '-'],
    ['Disciplina', ctx.disciplinaExibir || '-'],
  ];

  const boxH = 96;
  desenharRetanguloArredondado(page, x0, y - boxH, contentW, boxH, 8, {
    fill: rgb(0.973, 0.98, 0.988),
    border: c(RIR_PDF_COLORS.border),
    borderWidth: 0.75,
  });

  let rowY = y - pad - 8;
  for (let i = 0; i < rows.length; i++) {
    const col = i % 3;
    const cellX = x0 + col * colW + pad;
    if (col === 0 && i > 0) rowY -= 26;
    const [label, value] = rows[i]!;
    page.drawText(sanitizarTextoPdf(label).toUpperCase(), {
      x: cellX,
      y: rowY,
      size: RIR_PDF_TIPO.gridLabel,
      font: fontBold,
      color: c(RIR_PDF_COLORS.muted),
    });
    page.drawText(sanitizarTextoPdf(value).slice(0, 52), {
      x: cellX,
      y: rowY - 13,
      size: RIR_PDF_TIPO.gridValor,
      font: fontBold,
      color: c(RIR_PDF_COLORS.ink),
    });
  }

  return y - boxH - 8;
}

function desenharTagsInspecao(page: PDFPage, r: RirRegistro, fontBold: PDFFont, y: number): number {
  const x0 = RIR_PDF_MARGIN.left;
  const tags: [string, boolean][] = [
    ['Quantitativa', !!r.inspecaoQuantitativa],
    ['Qualitativa', !!r.inspecaoQualitativa],
    ['Dimensional', !!r.inspecaoDimensional],
  ];
  let x = x0;
  const tagH = 16;
  for (const [label, on] of tags) {
    const txt = `${on ? '✓' : '☐'} ${label}`;
    const tagSize = RIR_PDF_TIPO.tag;
    const w = fontBold.widthOfTextAtSize(txt, tagSize) + 18;
    desenharPill(page, x, y - tagH, w, tagH, {
      fill: on ? c(RIR_PDF_COLORS.greenBg) : c(RIR_PDF_COLORS.white),
      border: on ? rgb(0.73, 0.97, 0.82) : c(RIR_PDF_COLORS.border),
      borderWidth: 0.6,
    });
    page.drawText(txt, {
      x: x + 9,
      y: y - tagH + 5,
      size: tagSize,
      font: fontBold,
      color: on ? rgb(0.09, 0.4, 0.2) : c(RIR_PDF_COLORS.muted),
    });
    x += w + 8;
  }
  return y - tagH - 8;
}

function alinharTextoColunaTabela(
  key: keyof ReturnType<typeof largurasColunasPdf>,
  cx: number,
  w: number,
  tw: number,
): number {
  if (key === 'q') return cx + w - tw - 4;
  if (key === 'item' || key === 'u' || key === 'cert') return cx + (w - tw) / 2;
  return cx + 4;
}

function desenharDivisoresColunasTabela(
  page: PDFPage,
  x0: number,
  yTop: number,
  yBottom: number,
  contentW: number,
): void {
  const cols = largurasColunasPdf();
  const keys = ['item', 'cod', 'q', 'u', 'desc', 'cert'] as const;
  let cx = x0;
  for (let i = 1; i < keys.length; i++) {
    cx += cols[keys[i - 1]!];
    page.drawLine({
      start: { x: cx, y: yBottom },
      end: { x: cx, y: yTop },
      thickness: 0.35,
      color: c(RIR_PDF_COLORS.border),
    });
  }
  page.drawLine({
    start: { x: x0 + contentW, y: yBottom },
    end: { x: x0 + contentW, y: yTop },
    thickness: 0.35,
    color: c(RIR_PDF_COLORS.border),
  });
}

function desenharCabecalhoTabela(page: PDFPage, fontBold: PDFFont, y: number, continuacao = false): number {
  const x0 = RIR_PDF_MARGIN.left;
  const cols = largurasColunasPdf();
  const contentW = larguraConteudoPdf();
  const secH = 18;

  desenharRetanguloArredondado(page, x0, y - secH, contentW, secH, 6, {
    fill: c(RIR_PDF_COLORS.white),
    border: c(RIR_PDF_COLORS.border),
    borderWidth: 0.6,
  });
  page.drawRectangle({
    x: x0 + 1,
    y: y - secH + 3,
    width: 3,
    height: secH - 6,
    color: c(RIR_PDF_COLORS.blue),
  });
  const secTitulo = continuacao
    ? 'Material recebido (nota fiscal) — continuação'
    : 'Material recebido (nota fiscal)';
  page.drawText(secTitulo, {
    x: x0 + 12,
    y: y - 13,
    size: RIR_PDF_TIPO.secao,
    font: fontBold,
    color: c(RIR_PDF_COLORS.ink),
  });
  y -= secH + 2;

  const headH = 16;
  page.drawRectangle({
    x: x0,
    y: y - headH,
    width: contentW,
    height: headH,
    color: c(RIR_PDF_COLORS.blueLight),
    borderColor: c(RIR_PDF_COLORS.border),
    borderWidth: 0.45,
  });
  desenharDivisoresColunasTabela(page, x0, y, y - headH, contentW);

  const headers = ['Item', 'Código', 'Qtd.', 'Unid.', 'Descrição', 'Certificado'];
  const keys = ['item', 'cod', 'q', 'u', 'desc', 'cert'] as const;
  let cx = x0;
  for (let i = 0; i < headers.length; i++) {
    const key = keys[i]!;
    const w = cols[key];
    const thSize = RIR_PDF_TIPO.th;
    const tw = fontBold.widthOfTextAtSize(headers[i]!, thSize);
    page.drawText(headers[i]!, {
      x: alinharTextoColunaTabela(key, cx, w, tw),
      y: y - 11,
      size: thSize,
      font: fontBold,
      color: c(RIR_PDF_COLORS.ink),
    });
    cx += w;
  }
  return y - headH;
}

function desenharLinhaTabela(
  page: PDFPage,
  params: {
    font: PDFFont;
    fontBold: PDFFont;
    item: RirItemLinha;
    layout: RirPdfRowLayout;
    y: number;
    stripe: boolean;
    itemNum: number;
  },
): number {
  const { font, item, layout, stripe, itemNum } = params;
  const y = params.y;
  const x0 = RIR_PDF_MARGIN.left;
  const cols = largurasColunasPdf();
  const h = layout.height;
  const contentW = larguraConteudoPdf();

  page.drawRectangle({
    x: x0,
    y: y - h,
    width: contentW,
    height: h,
    color: stripe ? c(RIR_PDF_COLORS.rowAlt) : c(RIR_PDF_COLORS.white),
    borderColor: c(RIR_PDF_COLORS.border),
    borderWidth: 0.35,
  });
  desenharDivisoresColunasTabela(page, x0, y, y - h, contentW);

  let cx = x0;
  const vals: { key: keyof typeof cols; text: string; bold?: boolean; lines?: string[] }[] = [
    { key: 'item', text: String(itemNum), bold: true },
    { key: 'cod', text: '', lines: layout.codLines },
    { key: 'q', text: String(item.quantidade) },
    { key: 'u', text: sanitizarTextoPdf(item.unidade) },
    { key: 'desc', text: '', lines: layout.descLines },
    {
      key: 'cert',
      text: sanitizarTextoPdf((item.certificado || 'N/A').trim() || 'N/A'),
      bold: true,
    },
  ];

  for (const v of vals) {
    const w = cols[v.key];
    const tdSize = RIR_PDF_TIPO.td;
    const lineH = RIR_PDF_TABLE_LINE_H;
    if (v.lines) {
      const blockH = v.lines.length * lineH;
      let ly = y - (h - blockH) / 2 - tdSize + 2;
      for (const line of v.lines) {
        const lw = font.widthOfTextAtSize(line, tdSize);
        const twLine = Math.min(lw, w - 8);
        const lx =
          v.key === 'cod' || v.key === 'desc'
            ? cx + 4
            : cx + (w - twLine) / 2;
        page.drawText(line, {
          x: lx,
          y: ly,
          size: tdSize,
          font,
          color: c(RIR_PDF_COLORS.ink),
        });
        ly -= lineH;
      }
    } else if (v.key === 'cert') {
      const certTxt = v.text;
      const certSize = RIR_PDF_TIPO.cert;
      const pillW = Math.min(w - 6, font.widthOfTextAtSize(certTxt, certSize) + 12);
      const pillH = 12;
      const px = cx + (w - pillW) / 2;
      const py = y - h / 2 - pillH / 2;
      desenharPill(page, px, py, pillW, pillH, { fill: c(RIR_PDF_COLORS.blueLight) });
      page.drawText(certTxt, {
        x: px + (pillW - font.widthOfTextAtSize(certTxt, certSize)) / 2,
        y: py + 3,
        size: certSize,
        font: params.fontBold,
        color: c(RIR_PDF_COLORS.blue),
      });
    } else {
      const f = v.bold ? params.fontBold : font;
      const tw = f.widthOfTextAtSize(v.text, tdSize);
      page.drawText(v.text, {
        x: alinharTextoColunaTabela(v.key, cx, w, tw),
        y: y - h / 2 - tdSize / 2 + 2,
        size: tdSize,
        font: f,
        color: c(RIR_PDF_COLORS.ink),
      });
    }
    cx += w;
  }

  return y - h;
}

function desenharRodape(
  page: PDFPage,
  ctx: RirPdfContexto,
  font: PDFFont,
  fontBold: PDFFont,
  fonteLabel: string,
): void {
  const r = ctx.registro;
  const x0 = RIR_PDF_MARGIN.left;
  const contentW = larguraConteudoPdf();
  const base = RIR_PDF_MARGIN.bottom + RIR_PDF_FOLHA_H;

  const obs = sanitizarTextoPdf(r.observacoesQc || '-');
  const obsTop = base + 168;
  desenharRetanguloArredondado(page, x0, obsTop - 54, contentW, 54, 8, {
    fill: c(RIR_PDF_COLORS.yellowBg),
    border: c(RIR_PDF_COLORS.yellowBorder),
    borderWidth: 0.9,
  });
  page.drawText('Observações da inspeção:', {
    x: x0 + 8,
    y: obsTop - 14,
    size: RIR_PDF_TIPO.secao,
    font: fontBold,
    color: rgb(0.52, 0.3, 0.05),
  });
  page.drawText(obs.slice(0, 220), {
    x: x0 + 8,
    y: obsTop - 28,
    size: RIR_PDF_TIPO.gridValor,
    font,
    color: rgb(0.52, 0.3, 0.05),
  });

  const laudo = r.laudo || 'aprovado';
  const laudoTxt = laudoLabel(laudo);
  const pillW = fontBold.widthOfTextAtSize(laudoTxt, 11) + 28;
  desenharPill(page, x0 + contentW - pillW - 10, obsTop - 42, pillW, 24, {
    fill: laudoColor(laudo),
  });
  page.drawText(laudoTxt, {
    x: x0 + contentW - pillW / 2 - fontBold.widthOfTextAtSize(laudoTxt, 10) / 2 - 8,
    y: obsTop - 33,
    size: 10,
    font: fontBold,
    color: c(RIR_PDF_COLORS.white),
  });

  const traceTop = base + 128;
  const refReceb = r.recebimentoId || '—';
  desenharRetanguloArredondado(page, x0, traceTop - 30, contentW, 30, 6, {
    fill: rgb(0.95, 0.96, 0.97),
    border: c(RIR_PDF_COLORS.border),
    borderWidth: 0.55,
  });
  desenharBarraLateral(page, x0 + 1, traceTop - 28, 26, c(RIR_PDF_COLORS.blue));
  const trace = `Rastreabilidade: ID recebimento ${refReceb} · ID RIR ${r.id} · Estado: ${statusLabel(r.status)} · Engine ${RIR_PDF_VERSION} ${RIR_PDF_LAYOUT} · Fonte ${fonteLabel}`;
  page.drawText(trace.slice(0, 120), {
    x: x0 + 8,
    y: traceTop - 18,
    size: 7.5,
    font,
    color: c(RIR_PDF_COLORS.muted),
  });

  const signLineY = base + 72;
  const signW = contentW / 3;
  const assinaturas = [
    ['Responsável — recebimento', r.assinaturaRecebimento],
    ['Controle de qualidade', r.assinaturaCq],
    ['Cliente', r.assinaturaCliente],
  ] as const;

  for (let i = 0; i < assinaturas.length; i++) {
    const sx = x0 + i * signW;
    const [role, bloco] = assinaturas[i]!;
    page.drawLine({
      start: { x: sx + signW * 0.08, y: signLineY },
      end: { x: sx + signW * 0.92, y: signLineY },
      thickness: 0.6,
      color: c(RIR_PDF_COLORS.muted),
    });
    page.drawText(role, {
      x: sx + signW * 0.08,
      y: signLineY - 12,
      size: 9,
      font: fontBold,
      color: c(RIR_PDF_COLORS.blue),
    });
    page.drawText(sanitizarTextoPdf(bloco.nome) || '—', {
      x: sx + signW * 0.08,
      y: signLineY - 24,
      size: 11,
      font: fontBold,
      color: c(RIR_PDF_COLORS.ink),
    });
    page.drawText(bloco.data ? formatDatePtPdf(bloco.data) : '—', {
      x: sx + signW * 0.08,
      y: signLineY - 34,
      size: 9.25,
      font,
      color: c(RIR_PDF_COLORS.muted),
    });
  }

  const sepY = base + 38;
  page.drawLine({
    start: { x: x0, y: sepY },
    end: { x: x0 + contentW, y: sepY },
    thickness: 1.5,
    color: c(RIR_PDF_COLORS.blue),
  });

  const foot = `Documento gerado eletronicamente pelo I.S.O PRO${ctx.branding.rodapeInstituicao ?? ''}. Ref. ${r.codigo}.`;
  const footW = font.widthOfTextAtSize(foot, 7);
  page.drawText(foot.slice(0, 140), {
    x: x0 + (contentW - Math.min(footW, contentW)) / 2,
    y: base + 22,
    size: 7,
    font,
    color: c(RIR_PDF_COLORS.muted),
  });
}

export { RIR_PDF_VERSION } from './rirPdfMetadata';
