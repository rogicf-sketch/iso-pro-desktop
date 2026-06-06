import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';

import fs from 'node:fs/promises';

import os from 'node:os';

import path from 'node:path';


import { escreverShellPreviewRir } from './rirPdfPreviewShell.ts';
import { gerarPdfBytesFromHtml } from './gerarPdfBytesFromHtml.ts';
import { resolvePreloadPath } from './window.ts';

const RIR_PDF_MOTOR = 'html-chromium';

function sanitizarNomeArquivoRir(raw: unknown, fallback: string): string {
  const nome =
    typeof raw === 'string' && raw.trim()
      ? raw.trim().replace(/[^\w.\-() ]+/g, '_')
      : fallback;
  return nome.endsWith('.pdf') ? nome : `${nome}.pdf`;
}



function validarBase64Pdf(input: unknown): string | null {

  if (typeof input !== 'string' || !input.trim()) return null;

  return input.trim();

}



function bytesFromBase64(b64: string): Uint8Array {

  return new Uint8Array(Buffer.from(b64, 'base64'));

}



function validarPdfBasicoBytes(bytes: Uint8Array): { ok: true } | { ok: false; error: string } {
  if (bytes.length < 64) return { ok: false, error: 'PDF vazio ou incompleto.' };
  const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);
  if (head !== '%PDF-') return { ok: false, error: 'Arquivo não é um PDF válido.' };
  return { ok: true };
}

async function validarPdfRirBase64(b64: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return validarPdfBasicoBytes(bytesFromBase64(b64));
}

async function escreverPdfTemporario(base64: string, prefix = 'rir'): Promise<{ path: string; remove: () => Promise<void> }> {
  const buf = Buffer.from(base64, 'base64');
  const validacao = await validarPdfBasicoBytes(new Uint8Array(buf));

  if (!validacao.ok) {

    throw new Error(validacao.error);

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



async function abrirPreviewRirPdfInterno(
  b64: string,
  tituloStr: string,
  pdfFileName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let tmpPdf: Awaited<ReturnType<typeof escreverPdfTemporario>> | null = null;
  let tmpShell: Awaited<ReturnType<typeof escreverShellPreviewRir>> | null = null;

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
    tmpPdf = await escreverPdfTemporario(b64, 'rir-preview');
    tmpShell = await escreverShellPreviewRir(pdfFileName, RIR_PDF_MOTOR, tmpPdf.path);

    await win.loadFile(tmpShell.htmlPath);
    await win.webContents.executeJavaScript(`window.__rirPdfBase64 = ${JSON.stringify(b64)};`, true);
    win.show();
    win.focus();
    win.moveTop();
    return { ok: true as const };
  } catch (e) {
    if (!win.isDestroyed()) win.destroy();
    await tmpShell?.remove();
    await tmpPdf?.remove();
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: `Pré-visualização RIR: ${msg}` };
  }
}

export function registerRirPdfHandlers() {

  ipcMain.handle('desktop-pdf:rir', async (_event, base64: unknown, defaultName: unknown) => {

    const b64 = validarBase64Pdf(base64);

    if (!b64) return { ok: false as const, error: 'PDF inválido ou vazio.' };



    const validacao = await validarPdfRirBase64(b64);

    if (!validacao.ok) return { ok: false as const, error: validacao.error };



    let tmp: Awaited<ReturnType<typeof escreverPdfTemporario>> | null = null;

    try {

      tmp = await escreverPdfTemporario(b64);

      const nome =

        typeof defaultName === 'string' && defaultName.trim()

          ? defaultName.trim().replace(/[^\w.\-() ]+/g, '_')

          : 'RIR-documento.pdf';



      const { canceled, filePath } = await dialog.showSaveDialog({

        title: 'Guardar PDF — RIR',

        defaultPath: path.join(app.getPath('documents'), nome.endsWith('.pdf') ? nome : `${nome}.pdf`),

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



  ipcMain.handle('desktop-print:rir-pdf', async (_event, base64: unknown) => {

    const b64 = validarBase64Pdf(base64);

    if (!b64) return { ok: false as const, error: 'PDF inválido ou vazio.' };



    const validacao = await validarPdfRirBase64(b64);

    if (!validacao.ok) return { ok: false as const, error: validacao.error };



    let tmp: Awaited<ReturnType<typeof escreverPdfTemporario>> | null = null;

    const win = new BrowserWindow({

      show: false,

      backgroundColor: '#ffffff',

      webPreferences: { sandbox: true, contextIsolation: true },

    });



    try {

      tmp = await escreverPdfTemporario(b64, 'rir-print');

      await win.loadURL(`file://${tmp.path.replace(/\\/g, '/')}`);

      await new Promise<void>((resolve, reject) => {

        const t = setTimeout(() => reject(new Error('Timeout ao carregar PDF para impressão.')), 30_000);

        win.webContents.once('did-finish-load', () => {

          clearTimeout(t);

          resolve();

        });

        win.webContents.once('did-fail-load', (_e, code, desc) => {

          clearTimeout(t);

          reject(new Error(`Falha ao carregar PDF: ${code} ${desc}`));

        });

      });



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



  /** Pré-visualização RIR — gera PDF no processo principal (sem base64 ida/volta). */
  ipcMain.handle('desktop-preview:rir-from-html', async (_event, html: unknown, titulo: unknown, defaultName: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido para pré-visualização RIR.' };
    }
    const tituloStr =
      typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Pré-visualização — RIR';
    const pdfFileName = sanitizarNomeArquivoRir(defaultName, 'RIR-documento.pdf');

    const winLoading = new BrowserWindow({
      show: true,
      width: 420,
      height: 160,
      frame: true,
      resizable: false,
      autoHideMenuBar: true,
      title: tituloStr,
      backgroundColor: '#0f172a',
      webPreferences: { sandbox: true },
    });
    await winLoading.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        '<body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">A gerar PDF do RIR…</body>',
      )}`,
    );

    try {
      const pdfBuffer = await gerarPdfBytesFromHtml(html);
      const b64 = pdfBuffer.toString('base64');
      const validacao = await validarPdfRirBase64(b64);
      if (!validacao.ok) {
        if (!winLoading.isDestroyed()) winLoading.destroy();
        return validacao;
      }
      if (!winLoading.isDestroyed()) winLoading.destroy();
      return abrirPreviewRirPdfInterno(b64, tituloStr, pdfFileName);
    } catch (e) {
      if (!winLoading.isDestroyed()) winLoading.destroy();
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: `Pré-visualização RIR: ${msg}` };
    }
  });

  /** Pré-visualização RIR — janela Electron com PDF (fallback: visualizador Windows). */
  ipcMain.handle('desktop-preview:rir-pdf', async (_event, base64: unknown, titulo: unknown, defaultName: unknown) => {
    const b64 = validarBase64Pdf(base64);
    if (!b64) return { ok: false as const, error: 'PDF inválido ou vazio.' };

    const validacao = await validarPdfRirBase64(b64);
    if (!validacao.ok) return { ok: false as const, error: validacao.error };

    const tituloStr =
      typeof titulo === 'string' && titulo.trim() ? titulo.trim() : 'Pré-visualização — RIR';
    const pdfFileName = sanitizarNomeArquivoRir(defaultName, 'RIR-documento.pdf');

    return abrirPreviewRirPdfInterno(b64, tituloStr, pdfFileName);
  });



  ipcMain.handle('desktop-pdf:open-external', async (_event, base64: unknown) => {

    const b64 = validarBase64Pdf(base64);

    if (!b64) return { ok: false as const, error: 'PDF inválido.' };



    const validacao = await validarPdfRirBase64(b64);

    if (!validacao.ok) return { ok: false as const, error: validacao.error };



    let tmp: Awaited<ReturnType<typeof escreverPdfTemporario>> | null = null;

    try {

      tmp = await escreverPdfTemporario(b64, 'rir-open');

      const err = await shell.openPath(tmp.path);

      if (err) return { ok: false as const, error: err };

      return { ok: true as const };

    } catch (e) {

      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };

    }

  });

}


