/**
 * Publica o PDF worker na VM (mesma SSH de deploy-web.env).
 * Uso: npm run deploy:pdf-worker
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, '..');
const deployEnvPath = path.join(scriptsDir, 'deploy-web.env');
const workerEnvLocal = path.join(root, 'services', 'pdf-worker', 'pdf-worker.local.env');

function loadDeployEnvFile() {
  if (!fs.existsSync(deployEnvPath)) return;
  for (const line of fs.readFileSync(deployEnvPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
  }
}

function run(cmd, args, opts = {}) {
  const useShell =
    process.platform === 'win32' &&
    (cmd === 'npm.cmd' || cmd === 'npm' || cmd === 'npx.cmd' || cmd === 'npx');
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: useShell, ...opts });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

loadDeployEnvFile();

const sshKey = String(process.env.DEPLOY_SSH_KEY ?? '').trim();
const sshTarget = String(process.env.DEPLOY_SSH_TARGET ?? '').trim();
if (!sshKey || !sshTarget) {
  console.error('deploy-pdf-worker: defina DEPLOY_SSH_KEY e DEPLOY_SSH_TARGET em scripts/deploy-web.env');
  process.exit(1);
}
if (!fs.existsSync(workerEnvLocal)) {
  console.error('deploy-pdf-worker: crie services/pdf-worker/pdf-worker.local.env');
  process.exit(1);
}
if (!fs.existsSync(sshKey)) {
  console.error(`deploy-pdf-worker: chave SSH não encontrada: ${sshKey}`);
  process.exit(1);
}

const sshCommon = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-i', sshKey];
const sshDest = [...sshCommon, sshTarget];
const staging = path.join(root, 'services', 'pdf-worker', '.deploy-staging');
const distSrc = path.join(root, 'services', 'pdf-worker', 'dist');

console.log('deploy-pdf-worker: build…');
run('npm', ['run', 'build:pdf-worker']);

if (!fs.existsSync(path.join(distSrc, 'index.mjs'))) {
  console.error('deploy-pdf-worker: dist/index.mjs ausente');
  process.exit(1);
}

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
fs.writeFileSync(
  path.join(staging, 'package.json'),
  JSON.stringify(
    {
      name: 'iso-pro-pdf-worker',
      private: true,
      type: 'module',
      dependencies: { '@supabase/supabase-js': '^2.101.1', ws: '^8.18.3' },
    },
    null,
    2,
  ),
);

const unit = `[Unit]
Description=I.S.O PRO PDF Worker
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/iso-pro-pdf-worker
EnvironmentFile=/etc/iso-pro/pdf-worker.env
Environment=PDF_WORKER_FONTS_DIR=/opt/iso-pro-pdf-worker/dist/fonts
ExecStart=/usr/bin/node /opt/iso-pro-pdf-worker/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
fs.writeFileSync(path.join(staging, 'pdf-worker.service'), unit);

let envText = fs.readFileSync(workerEnvLocal, 'utf8');
if (!/PDF_WORKER_ID=/m.test(envText)) envText += '\nPDF_WORKER_ID=vm-oracle-1\n';
else envText = envText.replace(/PDF_WORKER_ID=.*/m, 'PDF_WORKER_ID=vm-oracle-1');
fs.writeFileSync(path.join(staging, 'pdf-worker.env'), envText);

console.log('deploy-pdf-worker: enviar para VM…');
run('ssh', [...sshDest, 'mkdir -p ~/iso-pro-pdf-worker-staging/dist']);
for (const name of fs.readdirSync(distSrc)) {
  run('scp', [...sshCommon, '-r', path.join(distSrc, name), `${sshTarget}:~/iso-pro-pdf-worker-staging/dist/`]);
}
run('scp', [...sshCommon, path.join(staging, 'package.json'), `${sshTarget}:~/iso-pro-pdf-worker-staging/`]);
run('scp', [...sshCommon, path.join(staging, 'pdf-worker.service'), `${sshTarget}:~/iso-pro-pdf-worker-staging/`]);
run('scp', [...sshCommon, path.join(staging, 'pdf-worker.env'), `${sshTarget}:~/iso-pro-pdf-worker-staging/`]);

const remoteScript = `
set -e
sudo mkdir -p /opt/iso-pro-pdf-worker /etc/iso-pro
sudo rsync -a --delete ~/iso-pro-pdf-worker-staging/dist/ /opt/iso-pro-pdf-worker/dist/
sudo cp ~/iso-pro-pdf-worker-staging/package.json /opt/iso-pro-pdf-worker/
cd /opt/iso-pro-pdf-worker
sudo npm install --omit=dev --no-audit --no-fund 2>/dev/null || sudo npm install --omit=dev --no-audit --no-fund
sudo cp ~/iso-pro-pdf-worker-staging/pdf-worker.env /etc/iso-pro/pdf-worker.env
sudo chmod 600 /etc/iso-pro/pdf-worker.env
sudo cp ~/iso-pro-pdf-worker-staging/pdf-worker.service /etc/systemd/system/pdf-worker.service
sudo systemctl daemon-reload
sudo systemctl enable pdf-worker
sudo systemctl restart pdf-worker
sleep 2
systemctl is-active pdf-worker
`;

console.log('deploy-pdf-worker: instalar e reiniciar serviço…');
run('ssh', [...sshDest, remoteScript]);

fs.rmSync(staging, { recursive: true, force: true });
console.log('deploy-pdf-worker: concluído. Worker activo na VM.');
