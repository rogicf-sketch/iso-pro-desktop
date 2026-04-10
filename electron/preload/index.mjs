import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('isoProDesktop', {
  platform: 'desktop',
  version: '0.1.0',
  getSecurityContext: () => ipcRenderer.invoke('desktop-security:get-context'),
});
