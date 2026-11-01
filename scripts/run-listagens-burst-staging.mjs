/**
 * Wrapper: carrega .env.staging e corre load-test-listagens-burst sem desligar TLS.
 *   node --use-system-ca scripts/run-listagens-burst-staging.mjs --parallel 40
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(root, '.env.staging'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
}
env.ISO_PRO_SMOKE_STAGING = '1';
env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
env.VITE_SUPABASE_ANON_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY || env.ISO_PRO_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
env.SUPABASE_TENANT_ID = env.SUPABASE_TENANT_ID || env.VITE_ISO_PRO_TENANT_ID;

const extra = process.argv.slice(2);
const r = spawnSync(
  process.execPath,
  ['--use-system-ca', path.join(root, 'scripts/load-test-listagens-burst.mjs'), ...extra],
  { cwd: root, env, stdio: 'inherit' },
);
process.exit(r.status ?? 1);
