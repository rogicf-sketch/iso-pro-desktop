import { ipcMain } from 'electron';

/**
 * @deprecated RIR usa HTML + Chromium no renderer (`imprimirRirPdf.ts`).
 * Mantém só IPC legado `gerar-pdf-bytes` (stub). Fontes: `rirFontsIpc.ts`.
 */
export function registerRirPdfGenerateHandlers() {
  ipcMain.handle('desktop-rir:gerar-pdf-bytes', async () => ({
    ok: false as const,
    error:
      'Motor RIR migrado para HTML/Chromium. Use Visualizar/Imprimir no módulo RIR (renderer).',
  }));

  ipcMain.handle('desktop-rir:diagnosticar-fontes', async () => ({
    ok: true as const,
    motor: 'html-chromium',
    note: 'Fontes via HTML/CSS; pdf-lib descontinuado para RIR.',
  }));
}
