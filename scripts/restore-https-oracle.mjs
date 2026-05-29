import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(scriptsDir, 'deploy-web.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const ssh = ['-o', 'BatchMode=yes', '-i', process.env.DEPLOY_SSH_KEY, process.env.DEPLOY_SSH_TARGET];

console.log('restore-https: certificados existentes …');
spawnSync('ssh', [...ssh, 'sudo ls -la /etc/letsencrypt/live/ 2>/dev/null || echo SEM_CERT'], {
  stdio: 'inherit',
  shell: false,
});

console.log('restore-https: certbot --nginx (reinstalar SSL) …');
const r = spawnSync(
  'ssh',
  [
    ...ssh,
    'sudo certbot --nginx --cert-name isoprogestaodemateriais.com.br -d isoprogestaodemateriais.com.br --non-interactive --redirect 2>&1',
  ],
  { stdio: 'inherit', shell: false },
);

if (r.status !== 0) {
  console.error('restore-https: certbot falhou — pode ser necessario correr manualmente na VM.');
  process.exit(r.status ?? 1);
}

console.log('restore-https: OK');
