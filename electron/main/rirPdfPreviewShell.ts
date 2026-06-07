import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function htmlShellPreviewRirPdf(fileName: string, versao: string, pdfFileUrl: string): string {
  const nome = fileName.replace(/"/g, '&quot;');
  const pdfSrc = pdfFileUrl.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Pré-visualização — RIR</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex; flex-direction: column;
      background: #334155; color: #e2e8f0;
    }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
      padding: 10px 14px; background: #0f172a; border-bottom: 1px solid #475569;
      flex-shrink: 0;
    }
    .toolbar button {
      padding: 8px 18px; font: 600 13px 'Segoe UI', system-ui, sans-serif;
      border-radius: 6px; border: 1px solid #38bdf8; background: #0284c7; color: #fff; cursor: pointer;
    }
    .toolbar button.secondary { border-color: #64748b; background: #1e293b; }
    .toolbar .hint { flex: 1 1 220px; font-size: 12px; color: #94a3b8; line-height: 1.35; }
    iframe { flex: 1; width: 100%; border: 0; background: #525659; }
  </style>
</head>
<body>
  <div class="toolbar" role="toolbar">
    <button type="button" id="rir-print">Imprimir PDF</button>
    <button type="button" id="rir-save" class="secondary">Guardar PDF…</button>
    <span class="hint">Pré-visualização I.S.O PRO · motor ${versao}. Use os botões acima (não Ctrl+P).</span>
  </div>
  <iframe id="rir-view" title="RIR PDF" src="${pdfSrc}"></iframe>
  <script>
    window.__rirPdfFileName = ${JSON.stringify(nome)};
    document.getElementById('rir-save').addEventListener('click', function () {
      if (window.isoProDesktop && window.isoProDesktop.saveRirPdf && window.__rirPdfBase64) {
        void window.isoProDesktop.saveRirPdf(window.__rirPdfBase64, window.__rirPdfFileName);
      }
    });
    document.getElementById('rir-print').addEventListener('click', function () {
      if (window.isoProDesktop && window.isoProDesktop.printRirPdf && window.__rirPdfBase64) {
        void window.isoProDesktop.printRirPdf(window.__rirPdfBase64);
      }
    });
  </script>
</body>
</html>`;
}

export async function escreverShellPreviewRir(
  fileName: string,
  versao: string,
  pdfPath: string,
): Promise<{ htmlPath: string; remove: () => Promise<void> }> {
  const pdfUrl = `file:///${pdfPath.replace(/\\/g, '/')}`;
  const html = htmlShellPreviewRirPdf(fileName, versao, pdfUrl);
  const htmlPath = path.join(os.tmpdir(), `rir-preview-${Date.now()}.html`);
  await fs.writeFile(htmlPath, html, 'utf8');
  return {
    htmlPath,
    remove: async () => {
      await fs.unlink(htmlPath).catch(() => undefined);
    },
  };
}
