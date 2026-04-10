import { app, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

function readWindowsMachineGuid() {
  if (process.platform !== 'win32') return '';

  try {
    const output = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    return match?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

function buildMachineFingerprint() {
  const machineGuid = readWindowsMachineGuid();
  if (process.platform === 'win32' && !machineGuid) {
    return '';
  }

  const base = [process.platform, os.hostname(), machineGuid].join('|');
  return createHash('sha256').update(base).digest('hex');
}

function getMachineLabel() {
  return `${os.hostname()} (${process.platform})`;
}

export function registerSecurityHandlers() {
  ipcMain.handle('desktop-security:get-context', async () => ({
    isElectron: true,
    machineFingerprint: buildMachineFingerprint(),
    machineLabel: getMachineLabel(),
    appVersion: app.getVersion(),
  }));
}
