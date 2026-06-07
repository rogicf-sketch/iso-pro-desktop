import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const exeName = `I.S.O PRO Setup ${version}.exe`;
const exePath = path.join(root, 'release', exeName);
const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
const yml = `version: ${version}
files:
  - url: ${exeName}
    sha512: ${sha512}
    size: ${buf.length}
path: ${exeName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;
fs.writeFileSync(path.join(root, 'release', 'latest.yml'), yml);
console.log(`latest.yml -> v${version}`);
