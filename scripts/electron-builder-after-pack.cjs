/**
 * electron-builder afterPack: embute icon.ico no iso-pro-desktop.exe
 * ANTES do NSIS/portable — senão a barra de tarefas fica com o átomo Electron
 * (signAndEditExecutable: false salta o rcedit nativo do builder).
 */
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const exeName = `${context.packager.platformSpecificBuildOptions.executableName || productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  const icoCandidates = [
    path.join(context.packager.projectDir, 'build', 'icon.ico'),
    path.join(process.cwd(), 'build', 'icon.ico'),
  ];
  const ico = icoCandidates.find((p) => fs.existsSync(p));

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] exe nao encontrado: ${exePath}`);
    return;
  }
  if (!ico) {
    console.warn('[afterPack] build/icon.ico em falta — corra npm run build:icon');
    return;
  }

  const { rcedit } = await import('rcedit');
  console.log(`[afterPack] a carimbar icone: ${exePath}`);
  await rcedit(exePath, { icon: ico });
  console.log('[afterPack] icone ISO PRO embutido no .exe');
};
