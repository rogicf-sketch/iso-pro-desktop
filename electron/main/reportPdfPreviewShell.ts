import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function htmlShellPreviewReportPdf(pdfFileUrl: string, fileName: string, titulo: string): string {
  const pdf = pdfFileUrl.replace(/"/g, '&quot;');
  const nome = fileName.replace(/"/g, '&quot;');
  const tit = titulo.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${tit}</title>
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
    <button type="button" id="report-print">Imprimir PDF</button>
    <button type="button" id="report-save" class="secondary">Guardar PDF…</button>
    <span class="hint">Pré-visualização oficial — PDF gerado pelo I.S.O PRO. Use os botões acima (não Ctrl+P).</span>
  </div>
  <iframe id="report-view" title="${tit}" src="${pdf}"></iframe>
  <script>
    window.__reportPdfFileName = ${JSON.stringify(nome)};
    document.getElementById('report-save').addEventListener('click', function () {
      if (window.isoProDesktop && window.isoProDesktop.saveReportPdf && window.__reportPdfBase64) {
        void window.isoProDesktop.saveReportPdf(window.__reportPdfBase64, window.__reportPdfFileName);
      }
    });
    document.getElementById('report-print').addEventListener('click', function () {
      if (window.isoProDesktop && window.isoProDesktop.printReportPdf && window.__reportPdfBase64) {
        void window.isoProDesktop.printReportPdf(window.__reportPdfBase64);
      }
    });
  </script>
</body>
</html>`;
}

export async function escreverShellPreviewReport(
  pdfPath: string,
  fileName: string,
  titulo: string,
): Promise<{ htmlPath: string; remove: () => Promise<void> }> {
  const pdfUrl = `file:///${pdfPath.replace(/\\/g, '/')}`;
  const html = htmlShellPreviewReportPdf(pdfUrl, fileName, titulo);
  const htmlPath = path.join(os.tmpdir(), `report-preview-${Date.now()}.html`);
  await fs.writeFile(htmlPath, html, 'utf8');
  return {
    htmlPath,
    remove: async () => {
      await fs.unlink(htmlPath).catch(() => undefined);
    },
  };
}
