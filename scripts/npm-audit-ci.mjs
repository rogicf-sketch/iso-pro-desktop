/**
 * npm audit com certificados do SO (contorna Kaspersky / SSL local no Windows).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const level = process.argv.includes('--audit-level=moderate') ? 'moderate' : 'high';

const r = spawnSync('npm', ['audit', `--audit-level=${level}`], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
});

process.exit(r.status ?? 1);
