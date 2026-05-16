import { BrowserWindow, ipcMain, app, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePreloadPath } from './window';

/**
 * Impressão de HTML via janela oculta no processo principal.
 * Evita PDF/página em branco que o Chromium costuma gerar com `print()` no renderer (blob / iframe).
 *
 * Pré-visualização (`desktop-preview:html`): janela visível — o renderer pode falhar com
 * `window.open` (null) no sandbox; o IPC contorna bloqueios de “pop-up”.
 */
export function registerPrintHandlers() {
  ipcMain.handle('desktop-preview:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }

    const tmpDir = app.getPath('temp');
    const filePath = path.join(tmpDir, `iso-pro-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    await fs.writeFile(filePath, html, 'utf8');

    const win = new BrowserWindow({
      show: false,
      width: 1120,
      height: 880,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      title: 'Pré-visualização',
      webPreferences: {
        preload: resolvePreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let tempFileRemoved = false;
    const removeTempFile = () => {
      if (tempFileRemoved) return;
      tempFileRemoved = true;
      void fs.unlink(filePath).catch(() => {
        /* ignore */
      });
    };
    win.once('closed', removeTempFile);

    try {
      /** `loadFile` no Windows com caminhos acentuados / espaços é mais fiável que `file://` + loadURL. */
      await win.webContents.loadFile(filePath);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timeout ao carregar pré-visualização.')), 30_000);
        win.webContents.once('did-fail-load', (_e, code, desc) => {
          clearTimeout(t);
          reject(new Error(`Falha ao carregar: ${code} ${desc}`));
        });
        win.webContents.once('did-finish-load', () => {
          clearTimeout(t);
          resolve();
        });
      });
      win.show();
      void win.focus();
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      removeTempFile();
      if (!win.isDestroyed()) {
        win.destroy();
      }
      return { ok: false as const, error: msg };
    }
  });

  ipcMain.handle('desktop-print:html', async (_event, html: unknown) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { ok: false as const, error: 'HTML inválido ou vazio.' };
    }

    const tmpDir = app.getPath('temp');
    const filePath = path.join(tmpDir, `iso-pro-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    await fs.writeFile(filePath, html, 'utf8');
    const fileUrl = pathToFileURL(filePath).href;

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
      await win.loadURL(fileUrl);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timeout ao carregar HTML para impressão.')), 30_000);
        win.webContents.once('did-fail-load', (_e, code, desc) => {
          clearTimeout(t);
          reject(new Error(`Falha ao carregar: ${code} ${desc}`));
        });
        win.webContents.once('did-finish-load', () => {
          clearTimeout(t);
          resolve();
        });
      });

      await new Promise((r) => setTimeout(r, 250));

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
      try {
        await fs.unlink(filePath);
      } catch {
        /* ignore */
      }
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

    const tmpDir = app.getPath('temp');
    const filePath = path.join(tmpDir, `iso-pro-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    await fs.writeFile(filePath, html, 'utf8');
    const fileUrl = pathToFileURL(filePath).href;

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
      await win.loadURL(fileUrl);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timeout ao carregar HTML para PDF.')), 30_000);
        win.webContents.once('did-fail-load', (_e, code, desc) => {
          clearTimeout(t);
          reject(new Error(`Falha ao carregar: ${code} ${desc}`));
        });
        win.webContents.once('did-finish-load', () => {
          clearTimeout(t);
          resolve();
        });
      });

      await new Promise((r) => setTimeout(r, 400));

      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
        margins: { marginType: 'none' },
      });

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
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    } finally {
      try {
        await fs.unlink(filePath);
      } catch {
        /* ignore */
      }
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
  });
}
