import { BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** pdf-to-printer é CJS; named import ESM falha no main Electron empacotado. */
const require = createRequire(import.meta.url);
const imprimirPdfWindows = require('pdf-to-printer').print as (
  pdf: string,
  options?: { silent?: boolean; printDialog?: boolean },
) => Promise<void>;

import { carregarPdfTemporarioNaJanela } from './pdfWebContents';

let pdfPrintWindow: BrowserWindow | null = null;

function obterJanelaImpressaoPdf(): BrowserWindow {
  if (pdfPrintWindow && !pdfPrintWindow.isDestroyed()) {
    return pdfPrintWindow;
  }
  pdfPrintWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  return pdfPrintWindow;
}

/** Fecha a janela oculta de impressão PDF (liberta memória ao sair). */
export function destruirJanelaImpressaoPdf(): void {
  if (pdfPrintWindow && !pdfPrintWindow.isDestroyed()) {
    pdfPrintWindow.destroy();
  }
  pdfPrintWindow = null;
}

function isImpressaoCanceladaPeloUtilizador(failureReason: string | undefined): boolean {
  const r = (failureReason ?? '').toLowerCase();
  return (
    r.includes('cancel') ||
    r.includes('cancelad') ||
    r.includes('anulad') ||
    r.includes('abort')
  );
}

async function imprimirPdfViaVisualizadorChromium(filePath: string): Promise<void> {
  const win = obterJanelaImpressaoPdf();
  await carregarPdfTemporarioNaJanela(win, filePath);

  await new Promise<void>((resolve, reject) => {
    win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      if (success) {
        resolve();
        return;
      }
      if (isImpressaoCanceladaPeloUtilizador(failureReason)) {
        resolve();
        return;
      }
      reject(new Error(failureReason || 'Impressão cancelada ou falhou.'));
    });
  });
}

/**
 * Imprime bytes PDF via diálogo do sistema.
 * No Windows usa o spooler nativo (preserva multipagina no «Microsoft Print to PDF»).
 */
export async function imprimirBufferPdfComDialogo(pdfBuffer: Buffer): Promise<void> {
  if (!pdfBuffer.length) {
    throw new Error('PDF vazio ou incompleto.');
  }

  const head = pdfBuffer.subarray(0, 5).toString('latin1');
  if (head !== '%PDF-') {
    throw new Error('Arquivo não é um PDF válido.');
  }

  const filePath = path.join(os.tmpdir(), `iso-pro-print-${Date.now()}.pdf`);
  await fs.writeFile(filePath, pdfBuffer);

  try {
    if (process.platform === 'win32') {
      try {
        await imprimirPdfWindows(filePath, { silent: false, printDialog: true });
        return;
      } catch (e) {
        console.warn('[I.S.O PRO] pdf-to-printer falhou; fallback visualizador Chromium:', e);
      }
    }

    await imprimirPdfViaVisualizadorChromium(filePath);
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
    const win = pdfPrintWindow;
    if (win && !win.isDestroyed()) {
      await win.webContents.loadURL('about:blank').catch(() => undefined);
    }
  }
}
