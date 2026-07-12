import fs from 'node:fs';
import crypto from 'node:crypto';

const file = 'release/I.S.O PRO Setup 0.1.79.exe';
const buf = fs.readFileSync(file);
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
const size = buf.length;
const yml = `version: 0.1.79
files:
  - url: I.S.O-PRO-Setup-0.1.79.exe
    sha512: ${sha512}
    size: ${size}
path: I.S.O-PRO-Setup-0.1.79.exe
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;
fs.writeFileSync('release/latest.yml', yml);
console.log('latest.yml OK', { size, sha512: sha512.slice(0, 20) + '…' });
