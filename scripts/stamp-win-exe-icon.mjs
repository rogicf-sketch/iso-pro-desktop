/**
 * Grava o ícone neon no .exe Windows quando electron-builder corre com
 * signAndEditExecutable: false (PC sem Developer Mode / symlinks) — nesse
 * modo o electron-builder NÃO embute o ícone no .exe (barra de tarefas fica Electron).
 *
 * Só carimba `release/win-unpacked/*.exe`. NÃO tocar no *-portable.exe:
 * o portable é um contentor NSIS — rcedit corrompe e fica ~100 KB.
 *
 * Uso: node scripts/stamp-win-exe-icon.mjs [caminho.exe]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ico = path.join(root, 'build', 'icon.ico');

if (!fs.existsSync(ico)) {
  console.error('stamp-win-exe-icon: falta build/icon.ico — corra npm run build:icon');
  process.exit(1);
}

function collectTargets(explicit) {
  if (explicit) {
    const p = path.resolve(explicit);
    if (/portable/i.test(path.basename(p))) {
      console.error('stamp-win-exe-icon: recusado — nao carimbar *-portable.exe (corrupto).');
      process.exit(1);
    }
    return [p];
  }
  const out = [];
  const unpacked = path.join(root, 'release', 'win-unpacked');
  if (fs.existsSync(unpacked)) {
    for (const name of fs.readdirSync(unpacked)) {
      if (!/\.exe$/i.test(name)) continue;
      if (/uninstall/i.test(name)) continue;
      out.push(path.join(unpacked, name));
    }
  }
  return out;
}

const targets = collectTargets(process.argv[2]);
if (!targets.length) {
  console.error('stamp-win-exe-icon: nenhum .exe em release/win-unpacked.');
  process.exit(1);
}

for (const exe of targets) {
  console.log('stamp-win-exe-icon:', exe);
  await rcedit(exe, { icon: ico });
  console.log('  ok');
}
