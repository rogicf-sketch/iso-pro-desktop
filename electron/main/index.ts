import { app, BrowserWindow } from 'electron';
import { registerSecurityHandlers } from './security';
import { createMainWindow } from './window';

function bootstrap() {
  registerSecurityHandlers();
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
