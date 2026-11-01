#!/usr/bin/env node
/**
 * Gates CI de blindagem: migrations idempotentes (IF NOT EXISTS / OR REPLACE),
 * checks historico-sot + mobile atendimento-sot, schema drift basico.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

function runNode(scriptRel) {
  const script = path.join(root, scriptRel);
  if (!fs.existsSync(script)) {
    console.error(`[check-blindagem-gates] script ausente: ${scriptRel}`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Migrations criticas devem usar IF NOT EXISTS / OR REPLACE (re-aplicavel). */
function checkMigrationsIdempotent() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f >= '20260803210000')
    .sort();
  let failed = 0;
  for (const file of files) {
    const src = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const createsTable = /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(src);
    const createsIndex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(src);
    if (createsTable) {
      console.error(`[check-blindagem-gates] ${file}: CREATE TABLE sem IF NOT EXISTS`);
      failed += 1;
    }
    if (createsIndex) {
      console.error(`[check-blindagem-gates] ${file}: CREATE INDEX sem IF NOT EXISTS`);
      failed += 1;
    }
  }
  if (failed) process.exit(1);
  console.log(`[check-blindagem-gates] ok: ${files.length} migrations recentes idempotentes (tabelas/indices)`);
}

checkMigrationsIdempotent();
runNode('scripts/check-historico-single-source.mjs');
runNode('scripts/validate-historico-release.mjs');
runNode('scripts/check-atendimento-perf-invariants.mjs');

const flagsSrc = fs.readFileSync(path.join(root, 'src/lib/isoProFeatureFlags.ts'), 'utf8');
const guardSrc = fs.readFileSync(path.join(root, 'src/lib/sotWriteGuard.ts'), 'utf8');
if (!/sot_require_rpc:\s*true/.test(flagsSrc) || !/SotRpcRequiredError/.test(guardSrc)) {
  console.error('[check-blindagem-gates] FAIL: sot_require_rpc hard-fail ausente');
  process.exit(1);
}
console.log('[check-blindagem-gates] ok: sot_require_rpc hard-fail');

/** Novas migrations nao devem reintroduzir GRANT EXECUTE ... TO anon em RPCs operacionais. */
function checkNoNewAnonExecuteGrants() {
  const cutoff = '20260804010000';
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f >= cutoff)
    .sort();
  const banned =
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.iso_pro_(?:patch_snapshot|submit_|write_|replace_|registrar_atendimento)/i;
  let failed = 0;
  for (const file of files) {
    const src = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!banned.test(line)) continue;
      // Permite se a linha seguinte imediata no bloco nao for "TO anon" — olha contexto ±2
      const window = lines.slice(Math.max(0, i), Math.min(lines.length, i + 3)).join(' ');
      if (/\bTO\s+anon\b/i.test(window) || /\bTO\s+anon\s*,/i.test(window)) {
        console.error(
          `[check-blindagem-gates] ${file}:${i + 1}: GRANT EXECUTE operacional para anon (JWT onda 2)`,
        );
        failed += 1;
      }
    }
  }
  if (failed) process.exit(1);
  console.log(`[check-blindagem-gates] ok: ${files.length} migrations sem novo GRANT anon operacional`);
}

checkNoNewAnonExecuteGrants();

/** Configurações não podem voltar a gravar via patch_snapshot (último buraco SoT). */
function checkConfiguracoesSot() {
  const syncPath = path.join(
    root,
    'src/modules/configuracoes/services/syncAlertaEstoqueConfigNuvem.service.ts',
  );
  if (!fs.existsSync(syncPath)) {
    console.error('[check-blindagem-gates] syncAlertaEstoqueConfigNuvem.service.ts ausente');
    process.exit(1);
  }
  const src = fs.readFileSync(syncPath, 'utf8');
  if (/commitIsoProSnapshotPatch/.test(src)) {
    console.error(
      '[check-blindagem-gates] FAIL: sync config ainda usa commitIsoProSnapshotPatch — usar iso_pro_write_configuracoes_sot',
    );
    process.exit(1);
  }
  if (!/writeConfiguracoesSotOnCloud|iso_pro_write_configuracoes_sot/.test(src)) {
    console.error('[check-blindagem-gates] FAIL: sync config sem writeConfiguracoesSotOnCloud');
    process.exit(1);
  }
  console.log('[check-blindagem-gates] ok: configuracoes SoT (sem patch_snapshot)');
}

checkConfiguracoesSot();

/** Services de domínio não podem reintroduzir commitIsoProSnapshotPatch (ramos legado mortos). */
function checkServicesSemPatchSnapshot() {
  const modulesDir = path.join(root, 'src', 'modules');
  const offenders = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.name.endsWith('.ts')) continue;
      if (ent.name.endsWith('.test.ts')) continue;
      if (!full.includes(`${path.sep}services${path.sep}`)) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (/commitIsoProSnapshotPatch/.test(src)) {
        offenders.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(modulesDir);
  if (offenders.length) {
    console.error(
      '[check-blindagem-gates] FAIL: commitIsoProSnapshotPatch em services (usar write_*_sot):\n  - ' +
        offenders.join('\n  - '),
    );
    process.exit(1);
  }
  console.log('[check-blindagem-gates] ok: services sem commitIsoProSnapshotPatch');
}

checkServicesSemPatchSnapshot();

const mobileCheck = path.join(root, '..', 'iso_pro_mobile', 'scripts', 'check-mobile-atendimento-sot.mjs');
if (fs.existsSync(mobileCheck)) {
  const r = spawnSync(process.execPath, [mobileCheck], {
    cwd: path.dirname(mobileCheck),
    encoding: 'utf8',
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) process.exit(r.status ?? 1);
} else {
  console.warn('[check-blindagem-gates] mobile check ausente (ok em CI so-desktop)');
}

console.log('[check-blindagem-gates] todos os gates OK.');
