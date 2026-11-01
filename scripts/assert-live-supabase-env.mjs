#!/usr/bin/env node
/** Falha o build de hosting se VITE_SUPABASE_URL nao for a base LIVE. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDeployTargetsLiveProd } from './iso-pro-project-identity.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
  }
}

loadEnv(path.join(root, '.env'));
assertDeployTargetsLiveProd(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '');
console.log('assert-live-supabase-env: OK →', process.env.VITE_SUPABASE_URL);
