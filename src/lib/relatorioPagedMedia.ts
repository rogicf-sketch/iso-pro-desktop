import { tagScriptPagedPolyfill } from './relatorioPagedJsBundle';

/** CSS base: pre-visualizacao Paged.js (ecra) + reset de impressao nativa. */
export function cssPagedMediaPreview(): string {
  return `
    #relatorio-paged-loading {
      text-align: center;
      padding: 28px 16px;
      color: #64748b;
      font-size: 13px;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }
    @media screen {
      body.rir-print-body,
      body.rnc-print-body,
      body.recibo-body,
      body.rfo-print-body,
      body.folha-campo-v2,
      body.rf-print-body,
      body.etiq-lote-body,
      body.iso-paged-report-body {
        background: #cbd5e1 !important;
        margin: 0;
        padding: 0;
      }
      .pagedjs_pages {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        padding: 16px 12px 28px;
        width: 100%;
        box-sizing: border-box;
      }
      .pagedjs_page {
        background: #fff;
        box-shadow: 0 6px 20px rgba(15, 23, 42, 0.14);
        border-radius: 2px;
      }
      .pagedjs_bleed,
      .pagedjs_marks-crop,
      .pagedjs_marks-middle,
      .pagedjs_marks-cross { display: none !important; }
    }
    @media print {
      #relatorio-paged-loading { display: none !important; }
      .pagedjs_pages { padding: 0 !important; gap: 0 !important; }
      .pagedjs_page { box-shadow: none !important; margin: 0 !important; }
      body.relatorio-paged-ready .iso-paged-source,
      body.relatorio-paged-ready .rir-paged-source {
        display: none !important;
      }
    }
    /* Só ocultar fonte DEPOIS da paginação — nunca com :has(.pagedjs_pages) */
    body.relatorio-paged-ready .iso-paged-source,
    body.relatorio-paged-ready .rir-paged-source {
      display: none !important;
    }
    body.relatorio-paged-falhou .iso-paged-source,
    body.relatorio-paged-falhou .rir-paged-source {
      display: block !important;
    }
    body.relatorio-paged-falhou .pagedjs_pages {
      display: none !important;
    }
    script { display: none !important; }
  `;
}

/** Pré-visualização em ecrã para relatórios **sem** Paged.js (documento A4 scroll). */
export function cssRelatorioNativoPreview(): string {
  return `
    @media screen {
      body.rir-print-body,
      body.rnc-print-body,
      body.recibo-body,
      body.rfo-print-body,
      body.iso-report-native-body {
        background: #cbd5e1 !important;
        margin: 0;
        padding: 16px 12px 28px;
      }
      .rir-doc,
      .iso-report-sheet {
        max-width: 210mm;
        margin: 0 auto;
        background: #fff;
        padding: 10mm 12mm 14mm;
        box-shadow: 0 6px 20px rgba(15, 23, 42, 0.14);
        box-sizing: border-box;
      }
    }
  `;
}

/** Inicializa Paged.js e sinaliza prontidao para impressao/PDF. */
export function scriptInicializarPagedMedia(loadingElementId = 'relatorio-paged-loading'): string {
  return `<script>
(function () {
  function capturarHtmlImpressao() {
    var root = document.documentElement.cloneNode(true);
    Array.from(root.querySelectorAll('script')).forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    var loading = root.querySelector('#relatorio-paged-loading');
    if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
    var barra = root.querySelector('.iso-pro-doc-preview-toolbar');
    if (barra && barra.parentNode) barra.parentNode.removeChild(barra);
    var dt = document.doctype;
    var dtStr = dt ? '<!DOCTYPE ' + dt.name + '>' : '<!DOCTYPE html>';
    window.__relatorioHtmlParaImpressao = dtStr + '\\n' + root.outerHTML;
  }

  function ocultarLoading(msg) {
    var el = document.getElementById(${JSON.stringify(loadingElementId)});
    if (!el) return;
    if (msg) el.textContent = msg;
    else if (el.parentNode) el.parentNode.removeChild(el);
  }

  function paginaTemConteudoUtil(page) {
    var box = page.querySelector('.pagedjs_page_content');
    if (!box) return false;
    if (box.querySelector(
      'table tbody tr, .rir-hdr, .rir-page1-head, .inst-header, h1, h2, .rfo-sec, .rfo-indice, .rnc-sec, .rf-sec, .fc-item'
    )) return true;
    var txt = (box.textContent || '').replace(/\\s+/g, ' ').trim();
    txt = txt.replace(/Folha \\d+ \\/ \\d+/gi, '').trim();
    return txt.length > 80;
  }

  function algumaPaginaTemConteudo() {
    var pages = document.querySelectorAll('.pagedjs_page');
    if (!pages.length) return false;
    for (var i = 0; i < pages.length; i++) {
      if (paginaTemConteudoUtil(pages[i])) return true;
    }
    return false;
  }

  /** Rejeita capa preenchida + folhas interiores vazias (bug comum Paged.js + colunas CSS). */
  function paginacaoDistribuidaOk() {
    var pages = document.querySelectorAll('.pagedjs_page');
    if (!pages.length) return false;
    if (pages.length === 1) return paginaTemConteudoUtil(pages[0]);
    var comConteudo = 0;
    for (var i = 0; i < pages.length; i++) {
      if (paginaTemConteudoUtil(pages[i])) comConteudo++;
    }
    if (pages.length > 1 && !paginaTemConteudoUtil(pages[1])) return false;
    var minOk = Math.max(2, Math.ceil(pages.length * 0.34));
    return comConteudo >= minOk;
  }

  function marcarPaginacaoPronta(flow) {
    var pages = document.querySelectorAll('.pagedjs_page');
    var ok = paginacaoDistribuidaOk();
    window.__relatorioPaginadoPronto = true;
    document.dispatchEvent(new Event('relatorio-paginado-pronto'));
    if (ok) {
      document.body.classList.add('relatorio-paged-ready');
      ocultarLoading();
    } else {
      document.body.classList.add('relatorio-paged-falhou');
      ocultarLoading('Paginação indisponível — a mostrar documento em modo simples.');
    }
    capturarHtmlImpressao();
  }

  window.__relatorioUsaPagedJs = true;
  window.__relatorioPaginadoPronto = false;
  window.PagedConfig = {
    after: function (flow) {
      try { marcarPaginacaoPronta(flow); } catch (e) {
        document.body.classList.add('relatorio-paged-falhou');
        ocultarLoading('Paginação indisponível — a mostrar documento em modo simples.');
        window.__relatorioPaginadoPronto = true;
        document.dispatchEvent(new Event('relatorio-paginado-pronto'));
        capturarHtmlImpressao();
      }
    }
  };

  window.setTimeout(function () {
    if (window.__relatorioPaginadoPronto) return;
    var pages = document.querySelectorAll('.pagedjs_page');
    if (!pages.length || !paginacaoDistribuidaOk()) {
      document.body.classList.add('relatorio-paged-falhou');
      ocultarLoading('Exibindo documento sem paginação automática.');
      window.__relatorioPaginadoPronto = true;
      document.dispatchEvent(new Event('relatorio-paginado-pronto'));
      capturarHtmlImpressao();
    }
  }, 5000);

  window.setTimeout(function () {
    if (window.__relatorioPaginadoPronto) return;
    document.body.classList.add('relatorio-paged-falhou');
    ocultarLoading('Tempo esgotado na paginação — a mostrar documento em modo simples.');
    window.__relatorioPaginadoPronto = true;
    document.dispatchEvent(new Event('relatorio-paginado-pronto'));
    capturarHtmlImpressao();
  }, 12000);
})();
</script>
${tagScriptPagedPolyfill(false)}`;
}

/** CSS @page partilhado — margens + cabecalho corrido + numeracao. */
export function cssPagedMediaAtPage(opts: {
  /** Nome do running element (CSS ident). Omitir para sem cabecalho corrido. */
  runningHeaderName?: string;
  /** Margem superior mm (espaco para cabecalho corrido). */
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  /** Ex.: A4, A4 landscape, 58mm 40mm */
  size?: string;
  showPageNumbers?: boolean;
  /** Primeira folha sem cabecalho corrido (default true quando ha running header). */
  firstPageNoRunningHeader?: boolean;
}): string {
  const run = opts.runningHeaderName;
  const mt = opts.marginTopMm ?? (run ? 20 : 10);
  const mr = opts.marginRightMm ?? 10;
  const mb = opts.marginBottomMm ?? 12;
  const ml = opts.marginLeftMm ?? 10;
  const size = opts.size ?? 'A4';
  const showNums = opts.showPageNumbers !== false;
  const firstNoRun = opts.firstPageNoRunningHeader !== false && !!run;
  const topCenter = run
    ? `@top-center {
    content: element(${run});
    vertical-align: top;
    width: 100%;
  }`
    : '';
  const bottomRight = showNums
    ? `@bottom-right {
    content: "Folha " counter(page) " / " counter(pages);
    font-size: 8.5pt;
    color: #64748b;
    font-family: 'Segoe UI', system-ui, sans-serif;
  }`
    : '';
  const firstPageRule = firstNoRun
    ? `@page :first {
  margin-top: ${Math.min(mt, 10)}mm;
  @top-center { content: none; }
}`
    : '';
  return `
@page {
  size: ${size};
  margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm;
  ${topCenter}
  ${bottomRight}
}
${firstPageRule}
`;
}
