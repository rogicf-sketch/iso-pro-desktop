import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('isoProDesktop', {
  platform: 'desktop',
  version: typeof __ISO_PRO_APP_VERSION__ !== 'undefined' ? __ISO_PRO_APP_VERSION__ : '0.0.0',
  /** Grava cliente/projeto para o script `upload-backup-to-oci.ps1` ler (userData/oci-upload-context.json). */
  writeOciUploadContext: (payload) => ipcRenderer.invoke('desktop-backup:write-oci-context', payload),
  syncBackupOracleSettings: (payload) => ipcRenderer.invoke('desktop-backup-oracle:sync-settings', payload),
  registrarAtividadeBackupOracle: (kind) => ipcRenderer.invoke('desktop-backup-oracle:registrar-atividade', kind),
  obterEstadoBackupOracle: () => ipcRenderer.invoke('desktop-backup-oracle:estado'),
  executarBackupOracleAgora: () => ipcRenderer.invoke('desktop-backup-oracle:executar-agora'),
  getSecurityContext: () => ipcRenderer.invoke('desktop-security:get-context'),
  loadConfigSecrets: () => ipcRenderer.invoke('desktop-config-secrets:load'),
  saveConfigSecrets: (secrets) => ipcRenderer.invoke('desktop-config-secrets:save', secrets),
  isConfigSecretsAvailable: () => ipcRenderer.invoke('desktop-config-secrets:is-available'),
  /** Recibos / relatórios HTML — impressão via motor PDF oficial (printToPDF). */
  printHtml: (html) => ipcRenderer.invoke('desktop-print:html', html),
  /** Impressão da janela de pré-visualização (motor PDF oficial — layout idêntico ao Guardar PDF). */
  printJanelaAtual: () => ipcRenderer.invoke('desktop-print:visible'),
  /** PDF com fundos/cores alinhados à pré-visualização (sem depender do diálogo Imprimir). */
  saveHtmlAsPdf: (html) => ipcRenderer.invoke('desktop-pdf:html', html),
  /** PDF da janela de pré-visualização (já paginada pelo Paged.js). */
  savePdfJanelaAtual: () => ipcRenderer.invoke('desktop-pdf:visible'),
  /** RIR — PDF programático (pdf-lib), fiável para paginação e cabeçalho repetido. */
  saveRirPdf: (base64, defaultName) => ipcRenderer.invoke('desktop-pdf:rir', base64, defaultName),
  printRirPdf: (base64) => ipcRenderer.invoke('desktop-print:rir-pdf', base64),
  previewRirPdf: (base64, titulo, defaultName) =>
    ipcRenderer.invoke('desktop-preview:rir-pdf', base64, titulo, defaultName),
  previewRirPdfFromHtml: (html, titulo, defaultName) =>
    ipcRenderer.invoke('desktop-preview:rir-from-html', html, titulo, defaultName),
  /** Abre o PDF no visualizador padrão do Windows (fallback fiável). */
  openRirPdfExterno: (base64) => ipcRenderer.invoke('desktop-pdf:open-external', base64),
  /** Relatórios HTML → PDF canônico (bytes, preview, guardar, imprimir). */
  gerarPdfBytesFromHtml: (html) => ipcRenderer.invoke('desktop-pdf:html-bytes', html),
  saveReportPdf: (base64, defaultName) => ipcRenderer.invoke('desktop-pdf:report', base64, defaultName),
  printReportPdf: (base64) => ipcRenderer.invoke('desktop-print:report-pdf', base64),
  previewReportPdf: (base64, titulo, defaultName) =>
    ipcRenderer.invoke('desktop-preview:report-pdf', base64, titulo, defaultName),
  beginReportPdfPreviewLoading: (titulo) => ipcRenderer.invoke('desktop-preview:report-loading-begin', titulo),
  previewReportPdfFromHtml: (html, titulo, defaultName) =>
    ipcRenderer.invoke('desktop-preview:report-from-html', html, titulo, defaultName),
  /** Gera bytes do RIR no processo principal (pdf-lib + fontkit + fs). */
  gerarRirPdfBytes: (ctx) => ipcRenderer.invoke('desktop-rir:gerar-pdf-bytes', ctx),
  diagnosticarRirPdfFontes: () => ipcRenderer.invoke('desktop-rir:diagnosticar-fontes'),
  loadRirPdfFontesEmbutidas: () => ipcRenderer.invoke('desktop-rir:fontes-embutidas'),
  /** Relatórios HTML — pré-visualização (evita `window.open` bloqueado no Electron). */
  beginHtmlPreviewLoading: (titulo) => ipcRenderer.invoke('desktop-preview:html-begin', titulo),
  previewHtml: (html) => ipcRenderer.invoke('desktop-preview:html', html),
  verifySmtpMail: (payload) => ipcRenderer.invoke('desktop-mail:verify-smtp', payload),
  sendMail: (payload) => ipcRenderer.invoke('desktop-mail:send', payload),
  /** HTTP Supabase via processo principal (TLS/rede fiavel no desktop empacotado). */
  supabaseFetch: (payload) => ipcRenderer.invoke('desktop-supabase:fetch', payload),
});
