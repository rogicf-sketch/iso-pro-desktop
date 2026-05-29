import { app, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

type VaultFile = {
  version: 1;
  /** Campo → blob encriptado (base64) via safeStorage do SO. */
  fields: Record<string, string>;
};

function vaultPath(): string {
  return path.join(app.getPath('userData'), 'config-secrets-vault.json');
}

async function readVaultFile(): Promise<VaultFile> {
  try {
    const raw = await fs.readFile(vaultPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<VaultFile>;
    if (parsed.version === 1 && parsed.fields && typeof parsed.fields === 'object') {
      return { version: 1, fields: parsed.fields };
    }
  } catch {
    /* primeiro arranque */
  }
  return { version: 1, fields: {} };
}

async function writeVaultFile(vault: VaultFile): Promise<void> {
  await fs.mkdir(path.dirname(vaultPath()), { recursive: true });
  await fs.writeFile(vaultPath(), JSON.stringify(vault, null, 2), 'utf8');
}

function decryptField(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  return safeStorage.decryptString(buf);
}

function encryptField(value: string): string {
  return safeStorage.encryptString(value).toString('base64');
}

export function registerConfigSecretsHandlers(): void {
  ipcMain.handle('desktop-config-secrets:is-available', () => safeStorage.isEncryptionAvailable());

  ipcMain.handle('desktop-config-secrets:load', async () => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: true as const, available: false as const, secrets: {} as Record<string, string> };
    }
    try {
      const vault = await readVaultFile();
      const secrets: Record<string, string> = {};
      for (const [key, encoded] of Object.entries(vault.fields)) {
        try {
          secrets[key] = decryptField(encoded);
        } catch {
          /* campo corrompido — ignorar */
        }
      }
      return { ok: true as const, available: true as const, secrets };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : 'Falha ao carregar cofre de segredos.',
      };
    }
  });

  ipcMain.handle('desktop-config-secrets:save', async (_e, payload: unknown) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false as const, error: 'Encriptacao do sistema operativo indisponivel nesta maquina.' };
    }
    if (!payload || typeof payload !== 'object') {
      return { ok: false as const, error: 'Payload de segredos invalido.' };
    }
    try {
      const input = payload as Record<string, unknown>;
      const vault = await readVaultFile();
      for (const [key, value] of Object.entries(input)) {
        const v = String(value ?? '').trim();
        if (v) {
          vault.fields[key] = encryptField(v);
        } else {
          delete vault.fields[key];
        }
      }
      await writeVaultFile(vault);
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : 'Falha ao gravar cofre de segredos.',
      };
    }
  });
}
