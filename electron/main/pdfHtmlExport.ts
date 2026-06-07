import type { WebContents } from 'electron';

/**
 * Extrai HTML limpo da janela de pré-visualização (sem barra Electron, scripts nem overlays).
 * Preferência: snapshot capturado após Paged.js (`__relatorioHtmlParaImpressao`).
 */
export async function extrairHtmlLimpoParaPdf(wc: WebContents): Promise<string> {
  const html = await wc.executeJavaScript(`
    (function () {
      function limparNo(root) {
        ['iso-electron-preview-bar', 'iso-electron-preview-bar-script', 'iso-electron-preview-hide-embedded-toolbar']
          .forEach(function (id) {
            var n = root.querySelector('#' + id);
            if (n && n.parentNode) n.parentNode.removeChild(n);
          });
        root.querySelectorAll('.iso-pro-doc-preview-toolbar').forEach(function (n) {
          if (n.parentNode) n.parentNode.removeChild(n);
        });
        root.querySelectorAll('script').forEach(function (n) {
          if (n.id === 'iso-pdf-meta') return;
          if (n.parentNode) n.parentNode.removeChild(n);
        });
        var loading = root.querySelector('#relatorio-paged-loading');
        if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
      }

      if (window.__relatorioHtmlParaImpressao && window.__relatorioHtmlParaImpressao.length > 200) {
        var cached = window.__relatorioHtmlParaImpressao;
        if (cached.indexOf('iso-electron-preview-bar') === -1) return cached;
      }

      var root = document.documentElement.cloneNode(true);
      limparNo(root);
      if (root.querySelectorAll('.pagedjs_page').length > 0) {
        root.querySelectorAll('.iso-paged-source, .rir-paged-source').forEach(function (n) {
          if (n.parentNode) n.parentNode.removeChild(n);
        });
      }
      var dt = document.doctype;
      var dtStr = dt ? '<!DOCTYPE ' + dt.name + '>' : '<!DOCTYPE html>';
      return dtStr + '\\n' + root.outerHTML;
    })()
  `);

  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Não foi possível extrair o HTML do documento.');
  }
  return html;
}

/** Aguarda fontes e um frame de pintura antes de exportar PDF. */
export async function aguardarRenderizacaoPdfAntesExport(wc: WebContents): Promise<void> {
  await wc
    .executeJavaScript(`
      Promise.all([
        document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
        new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }),
      ])
    `)
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 120));
}
