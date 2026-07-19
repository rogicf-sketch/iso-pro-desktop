import os from 'node:os';
import path from 'node:path';

/** Mock mínimo do `electron` para testes do processo principal em ambiente node. */
export const app = {
  getPath(name: string): string {
    return path.join(os.tmpdir(), 'iso-pro-test', name);
  },
  on(): void {
    /* noop nos testes */
  },
  setAppUserModelId(): void {
    /* noop */
  },
  quit(): void {
    /* noop */
  },
};

export const BrowserWindow = class {};
export const ipcMain = { handle(): void {}, on(): void {} };
