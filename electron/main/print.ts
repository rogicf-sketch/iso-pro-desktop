import { BrowserWindow, ipcMain, app, dialog, type WebContents } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePreloadPath } from './window';
import { escreverRelatorioHtmlTemp } from './reportHtmlTemp';
import { injetarBarraPreviewElectronNoHtml } from './htmlPreviewInject';
import { lerMetadadosPdfRelatorio, montarOpcoesPrintToPdfRelatorio } from './pdfPrintOptions';
import {
  aguardarLayoutRelatorioHtmlCondicional,
  aguardarLayoutRelatorioHtmlPreview,
  estabilizarDomAposLoadFile,
} from './pdfWebContents';
import { aguardarRenderizacaoPdfAntesExport, extrairHtmlLimpoParaPdf } from './pdfHtmlExport';
import { gerarPdfBytesFromHtml } from './gerarPdfBytesFromHtml';
import { imprimirBufferPdfComDialogo } from './pdfPrintBuffer';

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
      await aguardarLayoutRelatorioHtmlPreview(win.webContents);
      await win.webContents
        .executeJavaScript(
          `(function () {
            if (!window.__relatorioUsaPagedJs) return;
            var pages = document.querySelectorAll('.pagedjs_page');
            function paginaTemTexto(page) {
              var box = page.querySelector('.pagedjs_page_content');
              if (!box) return false;
              if (box.querySelector('table tbody tr, .rfo-sec, .rfo-capa, .rfo-body, .rfo-indice, .rir-hdr, h1, h2')) return true;
              var txt = (box.textContent || '').replace(/\\s+/g, ' ').trim();
              txt = txt.replace(/Folha \\d+ \\/ \\d+/gi, '').trim();
              return txt.length > 80;
            }
            if (!pages.length) {
              document.body.classList.remove('relatorio-paged-ready');
              document.body.classList.add('relatorio-paged-falhou');
              return;
            }
            var comConteudo = 0;
            for (var i = 0; i < pages.length; i++) {
              if (paginaTemTexto(pages[i])) comConteudo++;
            }
            var ok = comConteudo >= Math.max(2, Math.ceil(pages.length * 0.34)) && (pages.length === 1 || paginaTemTexto(pages[1]));
            if (!ok) {
              document.body.classList.remove('relatorio-paged-ready');
              document.body.classList.add('relatorio-paged-falhou');
            }
          })()`,
        )
        .catch(() => undefined);
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

  /** Impressão via motor PDF oficial (printToPDF) — layout idêntico ao «Guardar PDF». */
  ipcMain.handle('desktop-print:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }

    try {
      const pdfBuffer = await gerarPdfBytesFromHtml(html);
      await imprimirBufferPdfComDialogo(pdfBuffer);
      return { ok: true as const };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = raw.includes('Printing failed')
        ? 'Nao foi possivel imprimir. Use «Visualizar» e «Guardar PDF», ou reinicie a aplicacao.'
        : raw;
      return { ok: false as const, error: msg };
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

  /** Impressão da pré-visualização: motor PDF oficial (evita layout errado com «Microsoft Print to PDF»). */
  ipcMain.handle('desktop-print:visible', async (event) => {
    const wc = event.sender;
    try {
      await aguardarLayoutRelatorioHtmlCondicional(wc);
      await aguardarRenderizacaoPdfAntesExport(wc);

      const htmlLimpo = await extrairHtmlLimpoParaPdf(wc);
      const pdfBuffer = await gerarPdfBytesFromHtml(htmlLimpo);
      await imprimirBufferPdfComDialogo(pdfBuffer);

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
