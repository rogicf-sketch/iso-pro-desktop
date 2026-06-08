import { BrowserWindow, ipcMain, app, dialog, type WebContents } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePreloadPath } from './window';
import { escreverRelatorioHtmlTemp } from './reportHtmlTemp';
import { injetarBarraPreviewElectronNoHtml } from './htmlPreviewInject';
import { lerMetadadosPdfRelatorio, montarOpcoesPrintToPdfRelatorio } from './pdfPrintOptions';
import {
  aguardarLayoutRelatorioHtmlCondicional,
  estabilizarDomAposLoadFile,
} from './pdfWebContents';
import { aguardarRenderizacaoPdfAntesExport, extrairHtmlLimpoParaPdf } from './pdfHtmlExport';
import { gerarPdfBytesFromHtml } from './gerarPdfBytesFromHtml';
import { imprimirHtmlRelatorioWebContents } from './pdfPrintHtml';

/**
 * Impressão de HTML via janela oculta no processo principal.
 * Evita PDF/página em branco que o Chromium costuma gerar com `print()` no renderer (blob / iframe).
 *
 * Pré-visualização (`desktop-preview:html`): janela visível — o renderer pode falhar com
 * `window.open` (null) no sandbox; o IPC contorna bloqueios de “pop-up”.
 */

let htmlPreviewLoadingWindow: BrowserWindow | null = null;

function fecharJanelaCarregamentoHtmlPreview(win: BrowserWindow | null) {
  if (win && !win.isDestroyed()) win.destroy();
}

/** printToPDF com fallback quando cabecalho nativo Chromium falha (comum em RIR multipagina). */
async function printToPdfRelatorioRobusto(wc: WebContents): Promise<Buffer> {
  const pdfMeta = await lerMetadadosPdfRelatorio(wc);
  if (pdfMeta) {
    await wc.executeJavaScript(`document.body.classList.add('iso-pdf-header-native')`);
  }
  try {
    try {
      return await wc.printToPDF(montarOpcoesPrintToPdfRelatorio(pdfMeta));
    } catch (first) {
      if (!pdfMeta) throw first;
      console.warn('[I.S.O PRO] printToPDF com cabecalho nativo falhou; tentando CSS @page:', first);
      return await wc.printToPDF(montarOpcoesPrintToPdfRelatorio(null));
    }
  } finally {
    if (pdfMeta) {
      await wc
        .executeJavaScript(`document.body.classList.remove('iso-pdf-header-native')`)
        .catch(() => undefined);
    }
  }
}

function criarJanelaCarregamentoHtmlPreview(titulo: string): BrowserWindow {
  const win = new BrowserWindow({
    show: true,
    width: 420,
    height: 148,
    frame: true,
    resizable: false,
    autoHideMenuBar: true,
    title: titulo,
    backgroundColor: '#0f172a',
    webPreferences: { sandbox: true },
  });
  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      '<body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:0 16px">A preparar pré-visualização…</body>',
    )}`,
  );
  return win;
}

export function registerPrintHandlers() {
  /** Abre janela de feedback imediato antes de montar/enviar HTML (ex.: «Visualizar» planejamento). */
  ipcMain.handle('desktop-preview:html-begin', (_event, titulo: unknown) => {
    const tituloStr =
      typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Pré-visualização — I.S.O PRO';
    fecharJanelaCarregamentoHtmlPreview(htmlPreviewLoadingWindow);
    htmlPreviewLoadingWindow = criarJanelaCarregamentoHtmlPreview(tituloStr);
    return { ok: true as const };
  });

  ipcMain.handle('desktop-preview:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }

    let bundle: Awaited<ReturnType<typeof escreverRelatorioHtmlTemp>> | null = null;
    const winLoading = htmlPreviewLoadingWindow;
    htmlPreviewLoadingWindow = null;

    const win = new BrowserWindow({
      show: false,
      width: 1120,
      height: 880,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#cbd5e1',
      autoHideMenuBar: true,
      title: 'Pré-visualização — I.S.O PRO',
      webPreferences: {
        preload: resolvePreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.once('closed', () => {
      void bundle?.remove();
    });

    try {
      const htmlPreview = injetarBarraPreviewElectronNoHtml(html);
      bundle = await escreverRelatorioHtmlTemp(htmlPreview);
      await win.webContents.loadFile(bundle.htmlPath);
      await estabilizarDomAposLoadFile(win.webContents);
      fecharJanelaCarregamentoHtmlPreview(winLoading);
      if (!win.isDestroyed()) {
        win.show();
        win.focus();
        win.moveTop();
      }
      void aguardarLayoutRelatorioHtmlCondicional(win.webContents).catch(() => undefined);
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fecharJanelaCarregamentoHtmlPreview(winLoading);
      await bundle?.remove();
      if (!win.isDestroyed()) {
        win.destroy();
      }
      return { ok: false as const, error: msg };
    }
  });

  /** Impressão HTML rápida (Chromium print) + rodapé Folha X/N via CSS @page. */
  ipcMain.handle('desktop-print:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }

    let bundle: Awaited<ReturnType<typeof escreverRelatorioHtmlTemp>> | null = null;

    const win = new BrowserWindow({
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: resolvePreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const printTimeout = setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
    }, 120_000);

    try {
      bundle = await escreverRelatorioHtmlTemp(html);
      await win.webContents.loadFile(bundle.htmlPath);
      await estabilizarDomAposLoadFile(win.webContents);
      await imprimirHtmlRelatorioWebContents(win.webContents);

      return { ok: true as const };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.includes('Printing failed')
        ? 'Nao foi possivel imprimir. Use «Visualizar» e «Guardar PDF», ou reinicie a aplicacao.'
        : raw;
      return { ok: false as const, error: msg };
    } finally {
      clearTimeout(printTimeout);
      await bundle?.remove();
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
  });

  /**
   * PDF direto via Chromium (`printToPDF`), com fundos — evita depender de «Gráficos de fundo»
   * no diálogo do sistema ao usar «Guardar como PDF» na impressão.
   */
  ipcMain.handle('desktop-pdf:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }

    let bundle: Awaited<ReturnType<typeof escreverRelatorioHtmlTemp>> | null = null;

    const win = new BrowserWindow({
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: resolvePreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    try {
      bundle = await escreverRelatorioHtmlTemp(html);
      await win.webContents.loadFile(bundle.htmlPath);
      await estabilizarDomAposLoadFile(win.webContents);
      await aguardarLayoutRelatorioHtmlCondicional(win.webContents);
      await aguardarRenderizacaoPdfAntesExport(win.webContents);

      const pdfBuffer = await printToPdfRelatorioRobusto(win.webContents);

      const { canceled, filePath: savePath } = await dialog.showSaveDialog({
        title: 'Guardar PDF',
        defaultPath: path.join(app.getPath('documents'), 'documento-iso-pro.pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (canceled || !savePath) {
        return { ok: false as const, error: 'Operação cancelada.' };
      }

      await fs.writeFile(savePath, pdfBuffer);
      return { ok: true as const };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.includes('Printing failed')
        ? 'Nao foi possivel gerar o PDF. Tente «Imprimir / PDF» ou reinicie a aplicacao.'
        : raw;
      return { ok: false as const, error: msg };
    } finally {
      await bundle?.remove();
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
  });

  /** Impressão da pré-visualização: HTML directo (rápido) + Folha X/N em CSS. */
  ipcMain.handle('desktop-print:visible', async (event) => {
    const wc = event.sender;
    try {
      await imprimirHtmlRelatorioWebContents(wc);
      return { ok: true as const };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.includes('Printing failed')
        ? 'Nao foi possivel imprimir. Use «Guardar PDF» na pre-visualizacao ou tente novamente.'
        : raw;
      return { ok: false as const, error: msg };
    }
  });

  /** PDF da janela de pré-visualização: HTML limpo numa janela oculta (evita barra e páginas em branco). */
  ipcMain.handle('desktop-pdf:visible', async (event) => {
    const wc = event.sender;
    try {
      await aguardarLayoutRelatorioHtmlCondicional(wc);
      await aguardarRenderizacaoPdfAntesExport(wc);

      const htmlLimpo = await extrairHtmlLimpoParaPdf(wc);
      const pdfBuffer = await gerarPdfBytesFromHtml(htmlLimpo);

      const { canceled, filePath: savePath } = await dialog.showSaveDialog({
        title: 'Guardar PDF',
        defaultPath: path.join(app.getPath('documents'), 'documento-iso-pro.pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (canceled || !savePath) {
        return { ok: false as const, error: 'Operação cancelada.' };
      }

      await fs.writeFile(savePath, pdfBuffer);
      return { ok: true as const };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.includes('Printing failed')
        ? 'Nao foi possivel guardar o PDF. Use «Imprimir / PDF» ou tente novamente.'
        : raw;
      return { ok: false as const, error: msg };
    }
  });
}
