/**
 * Publica artefactos do electron-updater para
 * https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/
 *
 * Pré-requisitos:
 *   npm run dist:win   (gera release/*.exe + SHA256SUMS)
 *   node scripts/write-latest-yml.mjs
 *   scripts/deploy-web.env (mesmas chaves SSH do deploy web)
 *
 * Uso:
 *   node scripts/publish-updates-feed.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, '..');
const releaseDir = path.join(root, 'release');
const deployEnvPath = path.join(scriptsDir, 'deploy-web.env');

function loadDeployEnvFile() {
  if (!fs.existsSync(deployEnvPath)) return;
  for (const line of fs.readFileSync(deployEnvPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, i).trim()] = v;
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
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
  console.error('publish-updates-feed: define DEPLOY_SSH_KEY e DEPLOY_SSH_TARGET.');
  process.exit(1);
}
if (!fs.existsSync(sshKey)) {
  console.error(`publish-updates-feed: chave SSH nao encontrada: ${sshKey}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version ?? '').trim();
const latestYml = path.join(releaseDir, 'latest.yml');
if (!fs.existsSync(latestYml)) {
  console.error('publish-updates-feed: falta release/latest.yml — corre: node scripts/write-latest-yml.mjs');
  process.exit(1);
}

const remoteDir = '/var/www/iso-pro/updates/iso-pro-desktop';
const sshCommon = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-i', sshKey];

const candidates = fs
  .readdirSync(releaseDir)
  .filter((name) => {
    const lower = name.toLowerCase();
    if (name === 'latest.yml' || name === 'SHA256SUMS.txt') return true;
    if (!lower.endsWith('.exe') && !lower.endsWith('.blockmap')) return false;
    return name.includes(version);
  });

if (!candidates.includes('latest.yml')) candidates.push('latest.yml');

const files = [...new Set(candidates)].filter((n) => fs.existsSync(path.join(releaseDir, n)));
if (!files.some((f) => f.toLowerCase().endsWith('.exe'))) {
  console.error(`publish-updates-feed: nenhum .exe da versao ${version} em release/.`);
  process.exit(1);
}

console.log(`publish-updates-feed: a enviar ${files.length} ficheiro(s) v${version}…`);
run('ssh', [
  ...sshCommon,
  sshTarget,
  `sudo mkdir -p ${remoteDir} && (sudo chown $USER:$USER ${remoteDir} 2>/dev/null || true)`,
]);

let idx = 0;
for (const name of files) {
  idx += 1;
  const local = path.join(releaseDir, name);
  const tmp = `/tmp/iso-pro-update-${version}-${idx}.bin`;
  console.log(`  → ${name}`);
  run('scp', [...sshCommon, local, `${sshTarget}:${tmp}`]);
  run('ssh', [
    ...sshCommon,
    sshTarget,
    `sudo mkdir -p "${remoteDir}" && sudo mv "${tmp}" "${remoteDir}/${name}" && sudo chmod a+r "${remoteDir}/${name}"`,
  ]);
}

run('ssh', [
  ...sshCommon,
  sshTarget,
  `command -v chcon >/dev/null && sudo chcon -Rt httpd_sys_content_t ${remoteDir} 2>/dev/null || true; ls -la ${remoteDir}`,
]);

console.log('publish-updates-feed: OK');
console.log(`  https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/latest.yml`);
