import { app, BrowserWindow } from 'electron';
import { registerBackupContextHandlers } from './backupContext';
import { registerPrintHandlers } from './print';
import { registerSecurityHandlers } from './security';
import { createMainWindow } from './window';

/** Deve coincidir com `appId` em `electron-builder.yml` — ícone na barra de tarefas / notificações no Windows. */
if (process.platform === 'win32') {
  app.setAppUserModelId('com.isopro.desktop');
}

/** Inclina o motor Chromium para português (menus/diálogos internos, p.ex. impressão). */
app.commandLine.appendSwitch('lang', 'pt-BR');

function bootstrap() {
  registerSecurityHandlers();
  registerBackupContextHandlers();
  registerPrintHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
