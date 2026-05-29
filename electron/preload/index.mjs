import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('isoProDesktop', {
  platform: 'desktop',
  version: '0.1.15',
  /** Grava cliente/projeto para o script `upload-backup-to-oci.ps1` ler (userData/oci-upload-context.json). */
  writeOciUploadContext: (payload) => ipcRenderer.invoke('desktop-backup:write-oci-context', payload),
  syncBackupOracleSettings: (payload) => ipcRenderer.invoke('desktop-backup-oracle:sync-settings', payload),
  registrarAtividadeBackupOracle: (kind) => ipcRenderer.invoke('desktop-backup-oracle:registrar-atividade', kind),
  obterEstadoBackupOracle: () => ipcRenderer.invoke('desktop-backup-oracle:estado'),
  executarBackupOracleAgora: () => ipcRenderer.invoke('desktop-backup-oracle:executar-agora'),
  getSecurityContext: () => ipcRenderer.invoke('desktop-security:get-context'),
  /** Recibos / relatórios HTML — impressão fiável (processo principal). */
  printHtml: (html) => ipcRenderer.invoke('desktop-print:html', html),
  /** PDF com fundos/cores alinhados à pré-visualização (sem depender do diálogo Imprimir). */
  saveHtmlAsPdf: (html) => ipcRenderer.invoke('desktop-pdf:html', html),
  /** Relatórios HTML — pré-visualização (evita `window.open` bloqueado no Electron). */
  previewHtml: (html) => ipcRenderer.invoke('desktop-preview:html', html),
  verifySmtpMail: (payload) => ipcRenderer.invoke('desktop-mail:verify-smtp', payload),
  sendMail: (payload) => ipcRenderer.invoke('desktop-mail:send', payload),
});
