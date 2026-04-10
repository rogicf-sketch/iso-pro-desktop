/**
 * Depois de `electron-builder --win`: confirma artefactos e gera SHA256SUMS.txt em release/.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');

if (!fs.existsSync(releaseDir)) {
  console.error('verify-release: pasta release/ não existe. Corre antes: npm run dist:win');
  process.exit(1);
}

const entries = fs.readdirSync(releaseDir);
const exes = entries.filter((f) => f.toLowerCase().endsWith('.exe'));

if (exes.length === 0) {
  console.error('verify-release: nenhum .exe encontrado em release/.');
  process.exit(1);
}

const hasNsis = exes.some((f) => /setup/i.test(f));
if (!hasNsis) {
  console.error('verify-release: esperado instalador NSIS (*Setup*.exe) em release/.');
  process.exit(1);
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

console.log(`verify-release: OK — ${exes.length} .exe, SHA256SUMS.txt gerado.`);
