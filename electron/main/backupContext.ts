import { app, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

type OciUploadContextPayload = {
  cliente?: unknown;
  projeto?: unknown;
};

export function registerBackupContextHandlers() {
  ipcMain.handle(
    'desktop-backup:write-oci-context',
    async (_event, payload: unknown): Promise<{ ok: true; path: string } | { ok: false; error: string }> => {
      try {
        const p = payload as OciUploadContextPayload;
        const cliente = String(p?.cliente ?? '').trim();
        const projeto = String(p?.projeto ?? '').trim();
        const dir = app.getPath('userData');
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, 'oci-upload-context.json');
        const body = JSON.stringify(
          {
            cliente,
            projeto,
            atualizadoEm: new Date().toISOString(),
            origem: 'I.S.O PRO desktop (Configuracoes)',
          },
          null,
          2,
        );
        await fs.writeFile(filePath, body, 'utf8');
        return { ok: true, path: filePath };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    },
  );
}
