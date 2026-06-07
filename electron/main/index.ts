import { app, BrowserWindow } from 'electron';
import { registerBackupContextHandlers } from './backupContext';
import { registerConfigSecretsHandlers } from './configSecrets';
import { initBackupOracleAuto, registerBackupOracleAutoHandlers } from './backupOracleAuto';
import { registerMailHandlers } from './mail';
import { registerPrintHandlers } from './print';
import { registerRirPdfHandlers } from './rirPdfIpc';
import { registerReportPdfHandlers } from './reportPdfIpc';
import { registerRirFontsHandlers } from './rirFontsIpc';
import { registerRirPdfGenerateHandlers } from './rirPdfGenerateIpc';
import { registerSecurityHandlers } from './security';
import { destruirGeradorPdf, preaquecerGeradorPdf } from './gerarPdfBytesFromHtml';
import { createMainWindow } from './window';

/** Deve coincidir com `appId` em `electron-builder.yml` — ícone na barra de tarefas / notificações no Windows. */
if (process.platform === 'win32') {
  app.setAppUserModelId('com.isopro.desktop');
}

/** Inclina o motor Chromium para português (menus/diálogos internos, p.ex. impressão). */
app.commandLine.appendSwitch('lang', 'pt-BR');

function bootstrap() {
  try {
    registerSecurityHandlers();
    registerConfigSecretsHandlers();
    registerBackupContextHandlers();
    registerBackupOracleAutoHandlers();
    registerMailHandlers();
    registerPrintHandlers();
    registerRirPdfHandlers();
    registerReportPdfHandlers();
    registerRirFontsHandlers();
    registerRirPdfGenerateHandlers();
    const mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      destruirGeradorPdf();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    void initBackupOracleAuto();
    setTimeout(() => {
      preaquecerGeradorPdf();
    }, 2500);
  } catch (e) {
    console.error('[I.S.O PRO] Falha ao iniciar:', e);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.whenReady().then(bootstrap);

app.on('before-quit', () => {
  destruirGeradorPdf();
});

app.on('window-all-closed', () => {
  destruirGeradorPdf();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
