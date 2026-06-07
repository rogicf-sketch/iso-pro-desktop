import { BrowserWindow } from 'electron';
import { escreverRelatorioHtmlTemp } from './reportHtmlTemp';
import { lerMetadadosPdfRelatorio, montarOpcoesPrintToPdfRelatorio } from './pdfPrintOptions';
import {
  aguardarLayoutRelatorioHtml,
  estabilizarDomAposLoadFile,
  HTML_PDF_GEN_LOAD_TIMEOUT_MS,
  resetarJanelaGeracaoPdf,
} from './pdfWebContents';
import { aguardarRenderizacaoPdfAntesExport } from './pdfHtmlExport';

let pdfGenWindow: BrowserWindow | null = null;

/** Pré-inicializa a janela oculta de PDF (reduz latência na primeira pré-visualização). */
export function preaquecerGeradorPdf(): void {
  if (pdfGenWindow && !pdfGenWindow.isDestroyed()) return;
  obterJanelaGeracaoPdf();
}

/** Fecha a janela oculta — sem isto o .exe continua na memória após fechar a janela principal. */
export function destruirGeradorPdf(): void {
  if (pdfGenWindow && !pdfGenWindow.isDestroyed()) {
    pdfGenWindow.destroy();
  }
  pdfGenWindow = null;
}

/** Bloqueia pedidos HTTP externos na janela oculta (evita hang em logos/CDN). */
function bloquearRedeExternaPdf(win: BrowserWindow): void {
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    callback({ cancel: true });
  });
}

function obterJanelaGeracaoPdf(): BrowserWindow {
  if (pdfGenWindow && !pdfGenWindow.isDestroyed()) {
    return pdfGenWindow;
  }
  pdfGenWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  bloquearRedeExternaPdf(pdfGenWindow);
  return pdfGenWindow;
}

async function carregarHtmlNoBrowserWindow(win: BrowserWindow, htmlPath: string): Promise<void> {
  const wc = win.webContents;
  await resetarJanelaGeracaoPdf(win);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          'Timeout ao carregar HTML para PDF. Verifique imagens externas ou tente sem «PDF na nuvem».',
        ),
      );
    }, HTML_PDF_GEN_LOAD_TIMEOUT_MS);

    const fail = (_e: unknown, code: number, desc: string) => {
      clearTimeout(timer);
      reject(new Error(`Falha ao carregar HTML (${code}): ${desc}`));
    };

    const finish = () => {
      clearTimeout(timer);
      wc.removeListener('did-fail-load', fail);
      resolve();
    };

    wc.once('did-fail-load', fail);
    wc.once('did-finish-load', finish);

    void wc.loadFile(htmlPath).catch((err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Gera bytes PDF a partir de HTML (Chromium printToPDF, fundos incluídos). Reutiliza janela oculta. */
export async function gerarPdfBytesFromHtml(html: string): Promise<Buffer> {
  if (!html.trim()) {
    throw new Error('HTML inválido ou vazio.');
  }

  let bundle: Awaited<ReturnType<typeof escreverRelatorioHtmlTemp>> | null = null;
  const win = obterJanelaGeracaoPdf();

  try {
    bundle = await escreverRelatorioHtmlTemp(html);
    await carregarHtmlNoBrowserWindow(win, bundle.htmlPath);
    await estabilizarDomAposLoadFile(win.webContents);
    await aguardarLayoutRelatorioHtml(win.webContents, 60_000);
    await aguardarRenderizacaoPdfAntesExport(win.webContents);

    const pdfMeta = await lerMetadadosPdfRelatorio(win.webContents);
    if (pdfMeta) {
      await win.webContents.executeJavaScript(`document.body.classList.add('iso-pdf-header-native')`);
    }
    try {
      try {
        return await win.webContents.printToPDF(montarOpcoesPrintToPdfRelatorio(pdfMeta));
      } catch (first) {
        if (!pdfMeta) throw first;
        console.warn('[I.S.O PRO] printToPDF (gerador) cabecalho nativo falhou; tentando CSS @page:', first);
        return await win.webContents.printToPDF(montarOpcoesPrintToPdfRelatorio(null));
      }
    } finally {
      if (pdfMeta) {
        await win.webContents
          .executeJavaScript(`document.body.classList.remove('iso-pdf-header-native')`)
          .catch(() => undefined);
      }
    }
  } finally {
    await bundle?.remove();
  }
}

export { aguardarLayoutRelatorioHtml } from './pdfWebContents';
