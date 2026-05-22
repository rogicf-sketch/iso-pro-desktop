/**
 * Depois de `electron-builder --win`: arquiva instaladores antigos, confirma artefactos
 * da versao actual e gera SHA256SUMS.txt em release/.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const archiveDir = path.join(releaseDir, 'versoes-anteriores');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const currentVersion = String(packageJson.version ?? '').trim();

if (!fs.existsSync(releaseDir)) {
  console.error('verify-release: pasta release/ não existe. Corre antes: npm run dist:win');
  process.exit(1);
}

function isCurrentReleaseArtifact(name) {
  if (!currentVersion) return false;
  return name.includes(currentVersion);
}

function shouldArchiveInstaller(name) {
  const lower = name.toLowerCase();
  if (!lower.endsWith('.exe') && !lower.endsWith('.blockmap')) return false;
  if (!/setup|portable/i.test(name)) return false;
  if (isCurrentReleaseArtifact(name)) return false;
  return /0\.1\.\d+/.test(name);
}

function archiveOlderInstallers() {
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  let moved = 0;
  for (const name of fs.readdirSync(releaseDir)) {
    if (name === 'versoes-anteriores' || name === 'win-unpacked') continue;
    if (!shouldArchiveInstaller(name)) continue;
    const from = path.join(releaseDir, name);
    if (!fs.statSync(from).isFile()) continue;
    const dest = path.join(archiveDir, name);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(from, dest);
    moved += 1;
  }
  if (moved > 0) {
    console.log(`verify-release: ${moved} ficheiro(s) antigo(s) movido(s) para versoes-anteriores/`);
  }
}

archiveOlderInstallers();

const entries = fs.readdirSync(releaseDir);
const exes = entries.filter((f) => f.toLowerCase().endsWith('.exe'));

if (exes.length === 0) {
  console.error('verify-release: nenhum .exe encontrado em release/.');
  process.exit(1);
}

const hasNsis = exes.some((f) => /setup/i.test(f));
const hasPortable = exes.some((f) => /portable/i.test(f));
if (!hasNsis && !hasPortable) {
  console.error('verify-release: esperado *Setup*.exe (NSIS) ou *portable*.exe em release/.');
  process.exit(1);
}
if (!hasNsis && hasPortable) {
  console.warn(
    'verify-release: só existe o .exe portátil (sem instalador NSIS). Normal com `npm run dist:win:portable` ou se o NSIS falhou.',
  );
}

const lines = [];
for (const name of exes.sort()) {
  const filePath = path.join(releaseDir, name);
  const buf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  lines.push(`${hash}  ${name}`);
}

const outFile = path.join(releaseDir, 'SHA256SUMS.txt');
fs.writeFileSync(outFile, `${lines.join('\n')}\n`, 'utf8');

console.log(`verify-release: OK — ${exes.length} .exe (v${currentVersion}), SHA256SUMS.txt gerado.`);
