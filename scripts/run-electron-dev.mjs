import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'electron', '.dev-main.mjs');
const entry = path.join(root, 'electron', 'main', 'index.ts');

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile,
  format: 'esm',
  target: 'es2022',
  sourcemap: 'inline',
});

const electronCli = path.join(root, 'node_modules', 'electron', 'cli.js');
const child = spawn(process.execPath, [electronCli, outfile], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
