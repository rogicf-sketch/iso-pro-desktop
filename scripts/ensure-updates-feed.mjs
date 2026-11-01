/**
 * Cria /var/www/iso-pro-updates/iso-pro-desktop/ e instala snippet nginx do feed.
 * Usa o mesmo deploy-web.env (DEPLOY_SSH_KEY / DEPLOY_SSH_TARGET).
 *
 * Nao publica EXE — so prepara o path. Depois: scp latest.yml + artefactos.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, '..');
const deployEnvPath = path.join(scriptsDir, 'deploy-web.env');
const nginxSnippetLocal = path.join(root, 'deploy', 'oracle-cloud', 'nginx-iso-pro-updates.conf');

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
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
  console.error('ensure-updates-feed: define DEPLOY_SSH_KEY e DEPLOY_SSH_TARGET (deploy-web.env).');
  process.exit(1);
}
if (!fs.existsSync(sshKey)) {
  console.error(`ensure-updates-feed: chave SSH nao encontrada: ${sshKey}`);
  process.exit(1);
}
if (!fs.existsSync(nginxSnippetLocal)) {
  console.error('ensure-updates-feed: falta nginx-iso-pro-updates.conf');
  process.exit(1);
}

const sshCommon = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-i', sshKey];
const sshDest = [...sshCommon, sshTarget];

run('scp', [...sshCommon, nginxSnippetLocal, `${sshTarget}:~/nginx-iso-pro-updates.conf`]);

const remote = `
set -e
# Path sob o root do site (SELinux / Oracle — evita 403 fora de /var/www/iso-pro)
sudo mkdir -p /var/www/iso-pro/updates/iso-pro-desktop
if command -v chcon >/dev/null 2>&1; then
  sudo chcon -Rt httpd_sys_content_t /var/www/iso-pro/updates 2>/dev/null || true
fi
sudo chmod -R u=rwX,g=rX,o=rX /var/www/iso-pro/updates
sudo mkdir -p /etc/nginx/snippets
sudo cp ~/nginx-iso-pro-updates.conf /etc/nginx/snippets/iso-pro-updates.conf
# Injeta include no site isopro (com sudo)
sudo python3 - <<'PY'
from pathlib import Path
candidates = [
  Path('/etc/nginx/sites-available/isopro'),
  Path('/etc/nginx/sites-enabled/isopro'),
  Path('/etc/nginx/conf.d/isopro.conf'),
]
needle = 'include /etc/nginx/snippets/iso-pro-updates.conf;'
marker = 'include /etc/nginx/snippets/iso-pro-atendimento-api.conf;'
found = False
for p in candidates:
  if not p.is_file():
    continue
  found = True
  text = p.read_text(encoding='utf-8')
  if needle in text:
    print(f'ok: ja inclui updates em {p}')
    continue
  if marker in text:
    text = text.replace(marker, marker + '\\n    ' + needle, 1)
  elif 'autoindex off;' in text:
    text = text.replace('autoindex off;', 'autoindex off;\\n    ' + needle, 1)
  else:
    idx = text.rfind('}')
    if idx >= 0:
      text = text[:idx] + '    ' + needle + '\\n' + text[idx:]
    else:
      print(f'aviso: nao conseguiu patch em {p}')
      continue
  p.write_text(text, encoding='utf-8')
  print(f'patched: {p}')
if not found:
  print('aviso: nao encontrou ficheiro de site para patch automatico — inclui manualmente o snippet.')
PY
sudo nginx -t
sudo systemctl reload nginx
echo '# iso-pro desktop updates feed' | sudo tee /var/www/iso-pro/updates/iso-pro-desktop/README.txt >/dev/null
curl -sS -o /dev/null -w "updates_readme:%{http_code}\\n" https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/README.txt || true
`;

run('ssh', [...sshDest, remote]);
console.log('ensure-updates-feed: pasta e nginx OK. Publique latest.yml + EXE neste path.');
