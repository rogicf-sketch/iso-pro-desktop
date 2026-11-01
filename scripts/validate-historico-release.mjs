#!/usr/bin/env node
/**
 * Smoke estático da release de blindagem Histórico (v0.1.234+).
 * Nao substitui validacao manual em Construcap (Todos + Atualizar + Export).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version ?? '');

const [maj, min, patch] = version.split('.').map((n) => Number(n));
const okVersion =
  maj > 0 ||
  (maj === 0 && min > 1) ||
  (maj === 0 && min === 1 && patch >= 234);

if (!okVersion) {
  console.error(`[validate-historico-release] versao ${version} < 0.1.234`);
  process.exit(1);
}

console.log(`[validate-historico-release] package.json = ${version} (>= 0.1.234)`);
console.log('Checklist manual Construcap (acelen):');
console.log('  1. Atendimento → Historico → periodo Todos → Atualizar');
console.log('  2. Contagem lotes na UI == lotes distintos no CSV export');
console.log('  3. Dashboard → Reparar SoT se falhas sync > 0');
process.exit(0);
