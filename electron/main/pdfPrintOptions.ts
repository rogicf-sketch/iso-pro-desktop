import type { WebContents } from 'electron';

export type RelatorioPdfMeta = {
  headerTitle: string;
  headerSub?: string;
  headerCode?: string;
  footerPrefix?: string;
  footerOnly?: boolean;
};

/** Opções aceitas por `webContents.printToPDF` (Electron não exporta tipo dedicado). */
export type OpcoesPrintToPdfElectron = Parameters<WebContents['printToPDF']>[0];

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Cabeçalho HTML injetado pelo Chromium em **todas** as folhas (API nativa printToPDF). */
export function montarHeaderTemplatePdf(meta: RelatorioPdfMeta): string {
  const title = escHtml(meta.headerTitle || 'Relatório');
  const sub = escHtml(meta.headerSub || '');
  const code = escHtml(meta.headerCode || '');
  const subHtml = sub
    ? `<span style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:7px;font-weight:600;padding:2px 8px;border-radius:12px;max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub}</span>`
    : '';
  const codeHtml = code
    ? `<span style="font-weight:800;color:#2563eb;font-size:9px;line-height:12px;flex-shrink:0;">${code}</span>`
    : '';
  return `<div style="width:100%;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:2px 16px 4px 16px;box-sizing:border-box;border-bottom:2px solid #dbeafe;font-family:Segoe UI,system-ui,sans-serif;color:#1e293b;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
  <span style="font-weight:800;text-transform:uppercase;letter-spacing:0.04em;font-size:9px;flex:1 1 120px;">${title}</span>
  ${subHtml}
  ${codeHtml}
</div>`;
}

export function montarFooterTemplatePdf(meta: RelatorioPdfMeta): string {
  const prefix = escHtml(meta.footerPrefix || 'Folha');
  return `<div style="width:100%;font-size:8pt;color:#64748b;text-align:right;padding:0 20px 2px 0;font-family:'Segoe UI',system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  ${prefix}&nbsp;<span class="pageNumber"></span>/<span class="totalPages"></span>
</div>`;
}

export async function lerMetadadosPdfRelatorio(wc: WebContents): Promise<RelatorioPdfMeta | null> {
  try {
    const raw = await wc.executeJavaScript(`
      (function () {
        var el = document.getElementById('iso-pdf-meta');
        if (!el || !el.textContent) return null;
        try { return JSON.parse(el.textContent); } catch (e) { return null; }
      })()
    `);
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    const headerTitle = typeof m.headerTitle === 'string' ? m.headerTitle.trim() : '';
    if (!headerTitle) return null;
    return {
      headerTitle,
      headerSub: typeof m.headerSub === 'string' ? m.headerSub : undefined,
      headerCode: typeof m.headerCode === 'string' ? m.headerCode : undefined,
      footerPrefix: typeof m.footerPrefix === 'string' ? m.footerPrefix : undefined,
      footerOnly: m.footerOnly === true,
    };
  } catch {
    return null;
  }
}

/** Opções printToPDF: cabeçalho/rodapé nativos quando há meta; senão CSS @page. */
export function montarOpcoesPrintToPdfRelatorio(meta: RelatorioPdfMeta | null): OpcoesPrintToPdfElectron {
  const base: OpcoesPrintToPdfElectron = {
    printBackground: true,
    pageSize: 'A4',
    preferCSSPageSize: true,
    margins: { marginType: 'none' },
  };

  if (!meta) return base;

  const footerOnly = meta.footerOnly === true;
  const headerTemplate = footerOnly
    ? '<div style="width:100%;font-size:1px;height:0;margin:0;padding:0"></div>'
    : montarHeaderTemplatePdf(meta);

  return {
    printBackground: true,
    pageSize: 'A4',
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate: montarFooterTemplatePdf(meta),
    margins: {
      marginType: 'custom',
      top: footerOnly ? 0.39 : 0.65,
      bottom: 0.48,
      left: 0.39,
      right: 0.39,
    },
  };
}
