import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gerarPdfBytesFromHtml } from './gerarPdfBytesFromHtml';
import { escreverShellPreviewReport } from './reportPdfPreviewShell';
import { resolvePreloadPath } from './window';

function validarBase64Pdf(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  return input.trim();
}

function sanitizarNomeArquivo(raw: unknown, fallback: string): string {
  const nome =
    typeof raw === 'string' && raw.trim()
      ? raw.trim().replace(/[^\w.\-() ]+/g, '_')
      : fallback;
  return nome.endsWith('.pdf') ? nome : `${nome}.pdf`;
}

async function escreverPdfTemporarioGenerico(
  base64: string,
  prefix = 'report',
): Promise<{ path: string; remove: () => Promise<void> }> {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 5 || buf.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('Arquivo não é um PDF válido.');
  }
  const filePath = path.join(os.tmpdir(), `${prefix}-${Date.now()}.pdf`);
  await fs.writeFile(filePath, buf);
  return {
    path: filePath,
    remove: async () => {
      await fs.unlink(filePath).catch(() => undefined);
    },
  };
}

function criarJanelaCarregamentoPdf(titulo: string): BrowserWindow {
  const win = new BrowserWindow({
    show: true,
    width: 440,
    height: 168,
    frame: true,
    resizable: false,
    autoHideMenuBar: true,
    title: titulo,
    backgroundColor: '#0f172a',
    webPreferences: { sandbox: true },
  });
  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      '<body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:0 16px">A gerar PDF… Aguarde.</body>',
    )}`,
  );
  return win;
}

async function aguardarCarregamentoWebContents(win: BrowserWindow, timeoutMs = 30_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ao carregar pré-visualização.')), timeoutMs);
    const wc = win.webContents;
    const fail = (_e: unknown, code: number, desc: string) => {
      clearTimeout(timer);
      reject(new Error(`Falha ao carregar pré-visualização (${code}): ${desc}`));
    };
    const finish = () => {
      clearTimeout(timer);
      wc.removeListener('did-fail-load', fail);
      resolve();
    };
    wc.once('did-fail-load', fail);
    wc.once('did-finish-load', finish);
  });
}

async function abrirPreviewReportPdfInterno(
  b64: string,
  tituloStr: string,
  pdfFileName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let tmpPdf: Awaited<ReturnType<typeof escreverPdfTemporarioGenerico>> | null = null;
  let tmpShell: Awaited<ReturnType<typeof escreverShellPreviewReport>> | null = null;

  const win = new BrowserWindow({
    show: false,
    width: 960,
    height: 1080,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#334155',
    autoHideMenuBar: true,
    title: tituloStr,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('closed', () => {
    void tmpPdf?.remove();
    void tmpShell?.remove();
  });

  try {
    tmpPdf = await escreverPdfTemporarioGenerico(b64, 'report-preview');
    tmpShell = await escreverShellPreviewReport(tmpPdf.path, pdfFileName, tituloStr);

    await win.loadFile(tmpShell.htmlPath);
    await aguardarCarregamentoWebContents(win);
    await win.webContents.executeJavaScript(`window.__reportPdfBase64 = ${JSON.stringify(b64)};`, true);

    if (!win.isDestroyed()) {
      win.show();
      win.focus();
      win.moveTop();
    }
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await tmpPdf?.remove();
    await tmpShell?.remove();
    if (!win.isDestroyed()) win.destroy();
    return { ok: false as const, error: msg };
  }
}

export function registerReportPdfHandlers() {
  ipcMain.handle('desktop-pdf:html-bytes', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }
    try {
      const pdfBuffer = await gerarPdfBytesFromHtml(html);
      return { ok: true as const, base64: pdfBuffer.toString('base64'), bytes: pdfBuffer.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('desktop-pdf:report', async (_event, base64: unknown, defaultName: unknown) => {
    const b64 = validarBase64Pdf(base64);
    if (!b64) return { ok: false as const, error: 'PDF inválido ou vazio.' };

    let tmp: Awaited<ReturnType<typeof escreverPdfTemporarioGenerico>> | null = null;
    try {
      tmp = await escreverPdfTemporarioGenerico(b64);
      const nome = sanitizarNomeArquivo(defaultName, 'documento-iso-pro.pdf');
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar PDF — I.S.O PRO',
        defaultPath: path.join(app.getPath('documents'), nome),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { ok: false as const, error: 'Operação cancelada.' };
      await fs.copyFile(tmp.path, filePath);
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    } finally {
      await tmp?.remove();
    }
  });

  ipcMain.handle('desktop-print:report-pdf', async (_event, base64: unknown) => {
    const b64 = validarBase64Pdf(base64);
    if (!b64) return { ok: false as const, error: 'PDF inválido ou vazio.' };

    let tmp: Awaited<ReturnType<typeof escreverPdfTemporarioGenerico>> | null = null;
    const win = new BrowserWindow({
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: { sandbox: true, contextIsolation: true },
    });

    try {
      tmp = await escreverPdfTemporarioGenerico(b64, 'report-print');
      await win.loadURL(`file://${tmp.path.replace(/\\/g, '/')}`);
      await aguardarCarregamentoWebContents(win);

      await new Promise<void>((resolve, reject) => {
        win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'Impressão cancelada ou falhou.'));
        });
      });

      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    } finally {
      await tmp?.remove();
      if (!win.isDestroyed()) win.destroy();
    }
  });

  /** Gera PDF no processo principal e abre preview (evita base64 ida/volta no renderer). */
  ipcMain.handle(
    'desktop-preview:report-from-html',
    async (_event, html: unknown, titulo: unknown, defaultName: unknown) => {
      if (typeof html !== 'string' || !html.trim()) {
        return { ok: false as const, error: 'HTML inválido ou vazio.' };
      }
      const tituloStr =
        typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Pré-visualização — I.S.O PRO';
      const pdfFileName = sanitizarNomeArquivo(defaultName, 'documento-iso-pro.pdf');

      const winLoading = criarJanelaCarregamentoPdf(tituloStr);
      try {
        const pdfBuffer = await gerarPdfBytesFromHtml(html);
        const b64 = pdfBuffer.toString('base64');
        if (!winLoading.isDestroyed()) winLoading.destroy();
        return abrirPreviewReportPdfInterno(b64, tituloStr, pdfFileName);
      } catch (e) {
        if (!winLoading.isDestroyed()) winLoading.destroy();
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: `Pré-visualização: ${msg}` };
      }
    },
  );

  ipcMain.handle(
    'desktop-preview:report-pdf',
    async (_event, base64: unknown, titulo: unknown, defaultName: unknown) => {
      const b64 = validarBase64Pdf(base64);
      if (!b64) return { ok: false as const, error: 'PDF inválido ou vazio.' };

      const tituloStr =
        typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Pré-visualização — I.S.O PRO';
      const pdfFileName = sanitizarNomeArquivo(defaultName, 'documento-iso-pro.pdf');

      return abrirPreviewReportPdfInterno(b64, tituloStr, pdfFileName);
    },
  );
}
