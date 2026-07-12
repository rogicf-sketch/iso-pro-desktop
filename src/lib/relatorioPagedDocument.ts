import {
  cssBarraPreVisualizacaoImpressaoHtml,
  htmlBarraPreVisualizacaoImpressao,
  scriptBarraPreVisualizacaoImpressao,
} from './htmlRelatorioInstitucional';
import { scriptMetadadosPdfRelatorio, type RelatorioPdfMeta } from './relatorioPdfMeta';
import {
  cssPagedMediaAtPage,
  cssPagedMediaPreview,
  cssRelatorioNativoPreview,
  scriptInicializarPagedMedia,
} from './relatorioPagedMedia';

/** Classe comum no body para estilos de pre-visualizacao Paged.js. */
export const ISO_PAGED_BODY_CLASS = 'iso-paged-report-body';

export const ISO_PAGED_SOURCE_CLASS = 'iso-paged-source';

export type RunningHeaderInstitucionalOpts = {
  /** Prefixo CSS (ex.: `rnc`, `recibo`, `rfo`). */
  classPrefix: string;
  /** Nome do elemento corrido (`position: running(...)`). */
  runningName: string;
  /** HTML do logo (img ou texto). */
  logoHtml: string;
  /** Titulo central do cabecalho corrido. */
  title: string;
  /** Codigo / numero a direita (opcional). */
  code?: string;
};

/** Cabecalho compacto repetido nas folhas 2+ (Paged Media running element). */
export function montarRunningHeaderInstitucional(opts: RunningHeaderInstitucionalOpts): string {
  const p = opts.classPrefix;
  const codeHtml = opts.code
    ? `<span class="${p}-run-code">${opts.code}</span>`
    : '';
  return `<div class="${p}-running-hdr" aria-hidden="true">
  <div class="${p}-run-inner">
    <span class="${p}-run-logo">${opts.logoHtml}</span>
    <span class="${p}-run-title">${opts.title}</span>
    ${codeHtml}
  </div>
</div>`;
}

/** CSS do cabecalho corrido + `position: running(...)`. */
export function cssRunningHeaderInstitucional(opts: RunningHeaderInstitucionalOpts): string {
  const p = opts.classPrefix;
  const run = opts.runningName;
  return `
.${p}-running-hdr {
  position: running(${run});
  width: 100%;
  font-size: 8.5pt;
  color: #334155;
}
body.relatorio-paged-ready .${p}-running-hdr,
.pagedjs_page_content .${p}-running-hdr {
  display: none !important;
  height: 0 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}
.${p}-run-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 5px;
  border-bottom: 2px solid #dbeafe;
  width: 100%;
}
.${p}-run-logo { flex: 0 0 auto; }
.${p}-run-logo .inst-logo-img,
.${p}-run-logo img { max-height: 26px; max-width: 90px; display: block; object-fit: contain; }
.${p}-run-logo .inst-logo-placeholder { font-size: 8pt; padding: 2px 6px; }
.${p}-run-logo .inst-logo-hint { font-size: 8pt; }
.${p}-run-logo .inst-logo-sub { display: none; }
.${p}-run-logo .inst-run-logo-text { font-weight: 800; font-size: 9pt; color: #0f172a; white-space: nowrap; }
.${p}-run-title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  font-size: 8.5pt;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${p}-run-code { flex: 0 0 auto; font-weight: 800; color: #2563eb; font-size: 9pt; }
`;
}

export type DocumentoHtmlRelatorioPagedOpts = {
  title: string;
  lang?: string;
  /** Classes extra no body (alem de ${ISO_PAGED_BODY_CLASS}). */
  bodyClass: string;
  /** CSS especifico do relatorio (sem @page / preview Paged). */
  reportStyles: string;
  /** Conteudo fluente (cabecalho completo + corpo + rodape). */
  contentHtml: string;
  runningHeaderHtml?: string;
  runningHeaderCss?: string;
  /** Opcoes @page; omitir runningHeaderName para sem cabecalho corrido. */
  pagedAtPage?: Parameters<typeof cssPagedMediaAtPage>[0];
  includeToolbar?: boolean;
  /** Desativa Paged.js (ex.: etiqueta termica com tamanho fixo). */
  usePagedJs?: boolean;
  /** Metadados para cabecalho/rodape nativos do Electron `printToPDF`. */
  pdfMeta?: RelatorioPdfMeta;
};

/**
 * Documento HTML institucional completo com Paged.js, barra Imprimir/PDF e pre-visualizacao A4.
 */
export function montarDocumentoHtmlInstitucionalPaged(opts: DocumentoHtmlRelatorioPagedOpts): string {
  const lang = opts.lang ?? 'pt-BR';
  const toolbar = opts.includeToolbar !== false;
  const usePaged = opts.usePagedJs !== false;
  const pagedCss =
    opts.pagedAtPage != null || usePaged
      ? cssPagedMediaAtPage(opts.pagedAtPage ?? { runningHeaderName: 'isoRunHdr' })
      : '';
  const previewCss = usePaged ? cssPagedMediaPreview() : cssRelatorioNativoPreview();
  const runningCss = usePaged ? (opts.runningHeaderCss ?? '') : '';
  const barraCss = toolbar ? cssBarraPreVisualizacaoImpressaoHtml() : '';
  const barraHtml = toolbar ? htmlBarraPreVisualizacaoImpressao() : '';
  const barraScript = toolbar ? scriptBarraPreVisualizacaoImpressao() : '';
  const loadingHtml = usePaged
    ? `<div id="relatorio-paged-loading" role="status">A preparar folhas do relatório…</div>`
    : '';
  const pagedScript = usePaged ? scriptInicializarPagedMedia() : '';
  const runningHtml = usePaged ? (opts.runningHeaderHtml ?? '') : '';
  const sourceWrap = usePaged
    ? `<div class="${ISO_PAGED_SOURCE_CLASS}">${opts.contentHtml}</div>`
    : opts.contentHtml;
  const nativeBodyClass = usePaged ? ISO_PAGED_BODY_CLASS : 'iso-report-native-body';
  const pdfMetaScript = opts.pdfMeta ? scriptMetadadosPdfRelatorio(opts.pdfMeta) : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <style>
    html { color-scheme: light; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${barraCss}
    ${opts.reportStyles}
    ${runningCss}
    ${pagedCss}
    ${previewCss}
  </style>
</head>
<body class="${opts.bodyClass} ${nativeBodyClass}">
${barraHtml}
${loadingHtml}
${runningHtml}
${sourceWrap}
${barraScript}
${pdfMetaScript}
${pagedScript}
</body>
</html>`;
}
