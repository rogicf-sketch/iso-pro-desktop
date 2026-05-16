/**
 * Build (`npm run build:hosting`) + envio do `dist/` para a VM via SSH/SCP + rsync para o Nginx.
 *
 * Configuração: variáveis de ambiente ou ficheiro `scripts/deploy-web.env` (ver deploy-web.env.example).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, '..');
const deployEnvPath = path.join(scriptsDir, 'deploy-web.env');

function loadDeployEnvFile() {
  if (!fs.existsSync(deployEnvPath)) return;
  const text = fs.readFileSync(deployEnvPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined || process.env[k] === '') {
      process.env[k] = v;
    }
  }
}

function run(cmd, args, opts = {}) {
  const useShell =
    process.platform === 'win32' &&
    (cmd === 'npm.cmd' || cmd === 'npm' || cmd === 'npx.cmd' || cmd === 'npx');
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: root,
    shell: useShell,
    ...opts,
  });
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

loadDeployEnvFile();

const sshKey = String(process.env.DEPLOY_SSH_KEY ?? '').trim();
const sshTarget = String(process.env.DEPLOY_SSH_TARGET ?? '').trim();
const remotePath = String(process.env.DEPLOY_REMOTE_PATH ?? '/var/www/iso-pro').trim();
const remoteStaging = String(process.env.DEPLOY_REMOTE_STAGING ?? '~/iso-pro-deploy-staging').trim();
const skipBuild = String(process.env.DEPLOY_SKIP_BUILD ?? '').trim().toLowerCase() === '1';

if (!sshKey || !sshTarget) {
  console.error(
    'deploy-web: define DEPLOY_SSH_KEY e DEPLOY_SSH_TARGET (env ou scripts/deploy-web.env).',
  );
  console.error('Exemplo: copia scripts/deploy-web.env.example para scripts/deploy-web.env');
  process.exit(1);
}

if (!fs.existsSync(sshKey)) {
  console.error(`deploy-web: chave SSH não encontrada: ${sshKey}`);
  process.exit(1);
}

if (!skipBuild) {
  console.log('deploy-web: a correr npm run build:hosting …');
  run(process.platform === 'win32' ? 'npm' : 'npm', ['run', 'build:hosting']);
}

const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('deploy-web: pasta dist/ não existe. Corre build:hosting primeiro.');
  process.exit(1);
}

const sshCommon = ['-o', 'BatchMode=yes', '-i', sshKey];
const sshDest = [...sshCommon, sshTarget];

console.log('deploy-web: a preparar staging no servidor …');
run('ssh', [
  ...sshDest,
  `rm -rf ${remoteStaging} && mkdir -p ${remoteStaging}`,
]);

const entries = fs.readdirSync(distDir);
if (entries.length === 0) {
  console.error('deploy-web: dist/ está vazio.');
  process.exit(1);
}

const scpDest = `${sshTarget}:${remoteStaging}/`;
console.log(`deploy-web: a enviar ${entries.length} itens (scp) …`);
for (const name of entries) {
  const local = path.join(distDir, name);
  run('scp', [...sshCommon, '-r', local, scpDest]);
}

console.log(`deploy-web: a publicar em ${remotePath} (sudo rsync) …`);
run('ssh', [
  ...sshDest,
  `sudo rsync -a --delete ${remoteStaging}/ ${remotePath}/ && sudo chown -R nginx:nginx ${remotePath}`,
]);

console.log('deploy-web: concluído. Testa https://isoprogestaodemateriais.com.br/#/login (Ctrl+F5).');
