/**
 * Copia nginx-security-headers.conf para a VM e recarrega Nginx.
 * Usa scripts/deploy-web.env (mesmas credenciais SSH que deploy:web).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, '..');
const deployEnvPath = path.join(scriptsDir, 'deploy-web.env');
const headersLocal = path.join(root, 'deploy', 'oracle-cloud', 'nginx-security-headers.conf');
const siteLocal = path.join(root, 'deploy', 'oracle-cloud', 'nginx-isopro.conf');

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

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

loadDeployEnvFile();

const sshKey = String(process.env.DEPLOY_SSH_KEY ?? '').trim();
const sshTarget = String(process.env.DEPLOY_SSH_TARGET ?? '').trim();

if (!sshKey || !sshTarget || !fs.existsSync(sshKey)) {
  console.error('deploy-nginx-security: configure DEPLOY_SSH_KEY e DEPLOY_SSH_TARGET em scripts/deploy-web.env');
  process.exit(1);
}

if (!fs.existsSync(headersLocal)) {
  console.error('deploy-nginx-security: ficheiro local em falta:', headersLocal);
  process.exit(1);
}

const sshCommon = ['-o', 'BatchMode=yes', '-i', sshKey];
const remoteTmp = '/tmp/isopro-security-headers.conf';
const remoteSnippet = '/etc/nginx/snippets/isopro-security-headers.conf';
const remoteSite = '/etc/nginx/conf.d/isopro.conf';

console.log('deploy-nginx-security: a enviar snippet …');
run('scp', [...sshCommon, headersLocal, `${sshTarget}:${remoteTmp}`]);

if (fs.existsSync(siteLocal) && process.env.DEPLOY_NGINX_UPDATE_SITE === '1') {
  console.log('deploy-nginx-security: a enviar nginx-isopro.conf …');
  run('scp', [...sshCommon, siteLocal, `${sshTarget}:/tmp/nginx-isopro.conf`]);
}

console.log('deploy-nginx-security: a instalar e recarregar nginx …');
const siteCmd =
  fs.existsSync(siteLocal) && process.env.DEPLOY_NGINX_UPDATE_SITE === '1'
    ? 'sudo cp /tmp/nginx-isopro.conf /etc/nginx/conf.d/isopro.conf && '
    : '';
run('ssh', [
  ...sshCommon,
  sshTarget,
  `${siteCmd}sudo mkdir -p /etc/nginx/snippets && sudo cp ${remoteTmp} ${remoteSnippet} && sudo nginx -t && sudo systemctl reload nginx`,
]);

console.log('deploy-nginx-security: OK — cabecalhos activos.');
