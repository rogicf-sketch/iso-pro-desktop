/**
 * Publica o gateway de Confirmar atendimento na VM BR (SSH = deploy-web.env).
 * Uso: npm run deploy:atendimento-gateway
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, '..');
const deployEnvPath = path.join(scriptsDir, 'deploy-web.env');
const gatewayDir = path.join(root, 'services', 'atendimento-gateway');
const gatewayEnvLocal = path.join(gatewayDir, 'atendimento-gateway.local.env');
const pdfWorkerEnv = path.join(root, 'services', 'pdf-worker', 'pdf-worker.local.env');
const viteEnv = path.join(root, '.env');
const nginxSnippetLocal = path.join(root, 'deploy', 'oracle-cloud', 'nginx-atendimento-api.conf');

function loadEnvFile(filePath, into = process.env) {
  if (!fs.existsSync(filePath)) return into;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (into[k] === undefined || into[k] === '') into[k] = v;
  }
  return into;
}

function parseEnvText(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
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

loadEnvFile(deployEnvPath);

const sshKey = String(process.env.DEPLOY_SSH_KEY ?? '').trim();
const sshTarget = String(process.env.DEPLOY_SSH_TARGET ?? '').trim();
if (!sshKey || !sshTarget) {
  console.error('deploy-atendimento-gateway: defina DEPLOY_SSH_KEY e DEPLOY_SSH_TARGET em scripts/deploy-web.env');
  process.exit(1);
}
if (!fs.existsSync(sshKey)) {
  console.error(`deploy-atendimento-gateway: chave SSH nao encontrada: ${sshKey}`);
  process.exit(1);
}
if (!fs.existsSync(nginxSnippetLocal)) {
  console.error('deploy-atendimento-gateway: falta nginx-atendimento-api.conf');
  process.exit(1);
}

const sshCommon = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-i', sshKey];
const sshDest = [...sshCommon, sshTarget];
const staging = path.join(gatewayDir, '.deploy-staging');
const distSrc = path.join(gatewayDir, 'dist');

console.log('deploy-atendimento-gateway: build…');
run('npm', ['run', 'build:atendimento-gateway']);

if (!fs.existsSync(path.join(distSrc, 'index.mjs'))) {
  console.error('deploy-atendimento-gateway: dist/index.mjs ausente');
  process.exit(1);
}

// Montar env: gateway.local.env > pdf-worker.local.env + anon do .env Vite
const envMerged = {};
if (fs.existsSync(pdfWorkerEnv)) Object.assign(envMerged, parseEnvText(fs.readFileSync(pdfWorkerEnv, 'utf8')));
if (fs.existsSync(gatewayEnvLocal)) Object.assign(envMerged, parseEnvText(fs.readFileSync(gatewayEnvLocal, 'utf8')));
if (fs.existsSync(viteEnv)) {
  const vite = parseEnvText(fs.readFileSync(viteEnv, 'utf8'));
  if (!envMerged.SUPABASE_ANON_KEY && vite.VITE_SUPABASE_ANON_KEY) {
    envMerged.SUPABASE_ANON_KEY = vite.VITE_SUPABASE_ANON_KEY;
  }
  if (!envMerged.SUPABASE_URL && vite.VITE_SUPABASE_URL) {
    envMerged.SUPABASE_URL = vite.VITE_SUPABASE_URL;
  }
}
envMerged.PORT = envMerged.PORT || '8791';
envMerged.ALLOWED_ORIGINS =
  envMerged.ALLOWED_ORIGINS ||
  'https://isoprogestaodemateriais.com.br,https://www.isoprogestaodemateriais.com.br';
envMerged.RPC_TIMEOUT_MS = envMerged.RPC_TIMEOUT_MS || '12000';

if (!envMerged.SUPABASE_URL || !envMerged.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'deploy-atendimento-gateway: falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (gateway.local.env ou pdf-worker.local.env)',
  );
  process.exit(1);
}

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
fs.writeFileSync(
  path.join(staging, 'package.json'),
  JSON.stringify(
    {
      name: 'iso-pro-atendimento-gateway',
      private: true,
      type: 'module',
      dependencies: {},
    },
    null,
    2,
  ),
);

const unit = `[Unit]
Description=I.S.O PRO Atendimento Gateway
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/iso-pro-atendimento-gateway
EnvironmentFile=/etc/iso-pro/atendimento-gateway.env
ExecStart=/usr/bin/node /opt/iso-pro-atendimento-gateway/dist/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
fs.writeFileSync(path.join(staging, 'atendimento-gateway.service'), unit);

const envLines = [
  `SUPABASE_URL=${envMerged.SUPABASE_URL}`,
  `SUPABASE_SERVICE_ROLE_KEY=${envMerged.SUPABASE_SERVICE_ROLE_KEY}`,
  envMerged.SUPABASE_ANON_KEY ? `SUPABASE_ANON_KEY=${envMerged.SUPABASE_ANON_KEY}` : '',
  `PORT=${envMerged.PORT}`,
  `ALLOWED_ORIGINS=${envMerged.ALLOWED_ORIGINS}`,
  `RPC_TIMEOUT_MS=${envMerged.RPC_TIMEOUT_MS}`,
  '',
].filter((l) => l !== undefined);
fs.writeFileSync(path.join(staging, 'atendimento-gateway.env'), envLines.join('\n'));

console.log('deploy-atendimento-gateway: enviar para VM…');
run('ssh', [...sshDest, 'mkdir -p ~/iso-pro-atendimento-gateway-staging/dist']);
for (const name of fs.readdirSync(distSrc)) {
  run('scp', [
    ...sshCommon,
    path.join(distSrc, name),
    `${sshTarget}:~/iso-pro-atendimento-gateway-staging/dist/`,
  ]);
}
run('scp', [...sshCommon, path.join(staging, 'package.json'), `${sshTarget}:~/iso-pro-atendimento-gateway-staging/`]);
run('scp', [
  ...sshCommon,
  path.join(staging, 'atendimento-gateway.service'),
  `${sshTarget}:~/iso-pro-atendimento-gateway-staging/`,
]);
run('scp', [
  ...sshCommon,
  path.join(staging, 'atendimento-gateway.env'),
  `${sshTarget}:~/iso-pro-atendimento-gateway-staging/`,
]);
const patchNginxPy = path.join(scriptsDir, 'patch-nginx-atendimento-api.py');
run('scp', [...sshCommon, nginxSnippetLocal, `${sshTarget}:~/iso-pro-atendimento-gateway-staging/nginx-atendimento-api.conf`]);
run('scp', [...sshCommon, patchNginxPy, `${sshTarget}:~/iso-pro-atendimento-gateway-staging/patch-nginx-atendimento-api.py`]);

const remoteScript = `
set -e
sudo mkdir -p /opt/iso-pro-atendimento-gateway /etc/iso-pro /etc/nginx/snippets
sudo rsync -a --delete ~/iso-pro-atendimento-gateway-staging/dist/ /opt/iso-pro-atendimento-gateway/dist/
sudo cp ~/iso-pro-atendimento-gateway-staging/package.json /opt/iso-pro-atendimento-gateway/
cd /opt/iso-pro-atendimento-gateway
sudo npm install --omit=dev --no-audit --no-fund 2>/dev/null || sudo npm install --omit=dev --no-audit --no-fund
sudo cp ~/iso-pro-atendimento-gateway-staging/atendimento-gateway.env /etc/iso-pro/atendimento-gateway.env
sudo chmod 600 /etc/iso-pro/atendimento-gateway.env
sudo cp ~/iso-pro-atendimento-gateway-staging/atendimento-gateway.service /etc/systemd/system/atendimento-gateway.service
sudo cp ~/iso-pro-atendimento-gateway-staging/nginx-atendimento-api.conf /etc/nginx/snippets/iso-pro-atendimento-api.conf
sudo systemctl daemon-reload
sudo systemctl enable atendimento-gateway
sudo systemctl restart atendimento-gateway
sleep 2
systemctl is-active atendimento-gateway || (journalctl -u atendimento-gateway -n 30 --no-pager; exit 1)
sudo python3 ~/iso-pro-atendimento-gateway-staging/patch-nginx-atendimento-api.py
# Oracle Linux / SELinux: Nginx precisa de poder ligar a upstreams locais.
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != "Disabled" ]; then
  sudo setsebool -P httpd_can_network_connect 1 || true
fi
sudo nginx -t
sudo systemctl reload nginx
curl -sS -o /dev/null -w "health_local:%{http_code}\\n" http://127.0.0.1:8791/api/atendimento/health || true
curl -sS -o /dev/null -w "health_nginx:%{http_code}\\n" -k https://127.0.0.1/api/atendimento/health -H "Host: isoprogestaodemateriais.com.br" || true
`;

console.log('deploy-atendimento-gateway: instalar, nginx e reiniciar…');
run('ssh', [...sshDest, remoteScript]);

fs.rmSync(staging, { recursive: true, force: true });
console.log('deploy-atendimento-gateway: concluido.');
