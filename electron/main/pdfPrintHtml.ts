import type { WebContents } from 'electron';

import { aguardarLayoutRelatorioHtmlCondicional } from './pdfWebContents';

const STYLE_ID = 'iso-pro-print-footer-style';

function isImpressaoCanceladaPeloUtilizador(failureReason: string | undefined): boolean {
  const r = (failureReason ?? '').toLowerCase();
  return (
    r.includes('cancel') ||
    r.includes('cancelad') ||
    r.includes('anulad') ||
    r.includes('abort')
  );
}

/**
 * Impressão rápida do HTML já carregado (sem gerar PDF intermédio).
 * Injeta rodapé «Folha X/N» via CSS @page só durante a impressão — «Guardar PDF» continua com printToPDF.
 */
export async function imprimirHtmlRelatorioWebContents(wc: WebContents): Promise<void> {
  await aguardarLayoutRelatorioHtmlCondicional(wc);

  await wc.executeJavaScript(`
    (function () {
      document.body.classList.remove('iso-pdf-header-native');
      var bar = document.getElementById('iso-electron-preview-bar');
      if (bar) bar.style.setProperty('display', 'none', 'important');
      var toolbar = document.querySelector('.iso-pro-doc-preview-toolbar');
      if (toolbar) toolbar.style.setProperty('display', 'none', 'important');
      if (!document.getElementById('iso-pdf-meta')) return;
      if (document.getElementById('${STYLE_ID}')) return;
      var s = document.createElement('style');
      s.id = '${STYLE_ID}';
      s.textContent = [
        '@page {',
        '  margin-bottom: 12mm;',
        '  @bottom-right {',
        '    content: "Folha " counter(page) " / " counter(pages);',
        '    font-size: 8.5pt;',
        '    color: #64748b;',
        '    font-family: Segoe UI, system-ui, sans-serif;',
        '  }',
        '}'
      ].join('\\n');
      document.head.appendChild(s);
    })()
  `);

  try {
    await new Promise<void>((resolve, reject) => {
      wc.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (success) {
          resolve();
          return;
        }
        if (isImpressaoCanceladaPeloUtilizador(failureReason)) {
          resolve();
          return;
        }
        reject(new Error(failureReason || 'Impressão cancelada ou falhou.'));
      });
    });
  } finally {
    await wc
      .executeJavaScript(`
        (function () {
          var s = document.getElementById('${STYLE_ID}');
          if (s && s.parentNode) s.parentNode.removeChild(s);
          var bar = document.getElementById('iso-electron-preview-bar');
          if (bar) bar.style.removeProperty('display');
          var toolbar = document.querySelector('.iso-pro-doc-preview-toolbar');
          if (toolbar) toolbar.style.removeProperty('display');
        })()
      `)
      .catch(() => undefined);
  }
}
