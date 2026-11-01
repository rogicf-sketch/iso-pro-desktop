/**
 * Carrega .env.staging e corre um comando de load-test.
 * Uso: node scripts/run-load-on-staging.mjs -- scripts/load-test-....mjs --operators 50
 */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.staging');
if (!fs.existsSync(envPath)) {
  console.error('Falta .env.staging');
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  process.env[k] = v;
}
// Após JWT onda 2, writes exigem authenticated/service_role.
// Preferir SERVICE_ROLE do próprio .env.staging (nunca misturar com LIVE .env).
const stagingSvc =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ISO_PRO_SERVICE_ROLE_KEY || '';
if (!stagingSvc) {
  const envLocal = path.join(root, '.env');
  if (fs.existsSync(envLocal)) {
    for (const line of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      if (k !== 'SUPABASE_SERVICE_ROLE_KEY' && k !== 'ISO_PRO_SERVICE_ROLE_KEY') continue;
      const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (v && !process.env[k]) process.env[k] = v;
    }
  }
}
process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ISO_PRO_SERVICE_ROLE_KEY;
if (svc) {
  process.env.SUPABASE_ANON_KEY = svc;
  console.log('Load writes: a usar SERVICE_ROLE (JWT onda 2 bloqueia anon)');
}
process.env.SUPABASE_TENANT_ID =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';
process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY = '1';

const dash = process.argv.indexOf('--');
const childArgs = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
if (!childArgs.length) {
  console.error('Uso: node scripts/run-load-on-staging.mjs -- <script.mjs> [args...]');
  process.exit(1);
}

const script = childArgs[0];
const scriptPath = path.isAbsolute(script) ? script : path.join(root, script);
console.log('Staging load →', process.env.SUPABASE_URL, 'tenant', process.env.SUPABASE_TENANT_ID);
console.log('Cmd:', scriptPath, childArgs.slice(1).join(' '));

const child = spawn(process.execPath, ['--use-system-ca', scriptPath, ...childArgs.slice(1)], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
