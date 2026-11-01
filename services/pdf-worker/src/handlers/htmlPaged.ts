type BrowserHandle = {
  newPage: () => Promise<{
    setContent: (html: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<void>;
    evaluate: (pageFunction: string) => Promise<unknown>;
    pdf: (opts?: Record<string, unknown>) => Promise<Buffer>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

let browserPromise: Promise<BrowserHandle> | null = null;

async function importPlaywright() {
  return import('playwright');
}

async function getBrowser(): Promise<BrowserHandle> {
  if (!browserPromise) {
    const { chromium } = await importPlaywright();
    // Preferir Chrome do sistema — headless_shell no sandbox Cursor por vezes hang.
    browserPromise = chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--font-render-hinting=none', '--disable-dev-shm-usage'],
    }).catch(async () =>
      chromium.launch({
        headless: true,
        args: ['--font-render-hinting=none', '--disable-dev-shm-usage'],
      }),
    );
  }
  return browserPromise;
}

export type HtmlPdfPayload = {
  html: string;
  waitPagedJs?: boolean;
};

export async function gerarHtmlPdfFromPayload(payload: unknown): Promise<Uint8Array> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload HTML inválido.');
  }
  const { html, waitPagedJs = true } = payload as HtmlPdfPayload;
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('HTML vazio.');
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // setContent evita hang de networkidle em file:// (smoke e jobs HTML-first).
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });

    if (waitPagedJs) {
      await page.evaluate(`
        new Promise(function (resolve) {
          if (!window.__relatorioUsaPagedJs) { resolve(); return; }
          if (window.__relatorioPaginadoPronto) { resolve(); return; }
          var t = setTimeout(resolve, 180000);
          document.addEventListener('relatorio-paginado-pronto', function () {
            clearTimeout(t);
            resolve();
          }, { once: true });
        })
      `);
    }

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return new Uint8Array(pdfBuffer);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function closeHtmlBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close().catch(() => undefined);
  }
}
