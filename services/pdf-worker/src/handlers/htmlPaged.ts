import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type BrowserHandle = Awaited<ReturnType<Awaited<ReturnType<typeof importPlaywright>>['chromium']['launch']>>;

let browserPromise: Promise<BrowserHandle> | null = null;

async function importPlaywright() {
  return import('playwright');
}

async function getBrowser(): Promise<BrowserHandle> {
  if (!browserPromise) {
    const { chromium } = await importPlaywright();
    browserPromise = chromium.launch({
      headless: true,
      args: ['--font-render-hinting=none', '--disable-dev-shm-usage'],
    });
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

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iso-pro-pdf-'));
  const htmlPath = path.join(tmpDir, 'relatorio.html');
  await fs.writeFile(htmlPath, html, 'utf8');

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle', timeout: 120_000 });

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
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function closeHtmlBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close().catch(() => undefined);
  }
}
