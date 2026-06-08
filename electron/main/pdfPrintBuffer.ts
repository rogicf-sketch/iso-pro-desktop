import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { carregarPdfTemporarioNaJanela } from './pdfWebContents';

/**
 * Imprime bytes PDF via janela oculta (diálogo do sistema).
 * Usado após `printToPDF` — garante Folha 1/N e layout idênticos ao «Guardar PDF».
 */
export async function imprimirBufferPdfComDialogo(pdfBuffer: Buffer): Promise<void> {
  if (!pdfBuffer.length) {
    throw new Error('PDF vazio ou incompleto.');
  }

  const filePath = path.join(os.tmpdir(), `iso-pro-print-${Date.now()}.pdf`);
  await fs.writeFile(filePath, pdfBuffer);

  const win = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true },
  });

  try {
    await carregarPdfTemporarioNaJanela(win, filePath);

    await new Promise<void>((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || 'Impressão cancelada ou falhou.'));
      });
    });
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}
