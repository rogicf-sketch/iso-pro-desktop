/**
 * Prova formal de escala em staging-load (~100k docs).
 * NUNCA corre em LIVE.
 *
 * Passos:
 *  1) link CLI → staging-load
 *  2) db push (migrations em falta, ex. métricas)
 *  3) seed 100k (SQL em lotes)
 *  4) smoke listagens + burst
 *  5) (opcional) re-link LIVE
 *
 * Uso:
 *   node scripts/prova-escala-staging-100k.mjs
 *   node scripts/prova-escala-staging-100k.mjs --skip-seed
 *   node scripts/prova-escala-staging-100k.mjs --skip-push
 *   node scripts/prova-escala-staging-100k.mjs --relink-live
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISO_PRO_LIVE_PROJECT_REF,
  ISO_PRO_STAGING_LOAD_REF,
  projectRefFromSupabaseUrl,
} from './iso-pro-project-identity.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const skipSeed = args.has('--skip-seed');
const skipPush = args.has('--skip-push');
const skipSmoke = args.has('--skip-smoke');
const relinkLive = args.has('--relink-live');

function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const stagingEnv = loadEnvFile('.env.staging');
const stagingUrl = stagingEnv.VITE_SUPABASE_URL || stagingEnv.SUPABASE_URL || '';
const stagingRef = projectRefFromSupabaseUrl(stagingUrl);

if (stagingRef !== ISO_PRO_STAGING_LOAD_REF) {
  console.error(
    `RECUSADO: .env.staging aponta para "${stagingRef}", esperado staging-load ${ISO_PRO_STAGING_LOAD_REF}.`,
  );
  process.exit(1);
}

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    console.error(`Falha (${r.status}): ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

console.log('=== Prova escala staging-load ===');
console.log('ref:', stagingRef);

console.log('\n[1/5] Link CLI → staging-load');
run('npx', ['supabase', 'link', '--project-ref', ISO_PRO_STAGING_LOAD_REF, '--yes']);

if (!skipPush) {
  console.log('\n[2/5] db push (migrations)');
  run('npx', ['supabase', 'db', 'push', '--linked', '--yes']);
} else {
  console.log('\n[2/5] db push SKIP');
}

if (!skipSeed) {
  console.log('\n[3/5] Seed ~100k (pode demorar vários minutos)');
  run('npx', [
    'supabase',
    'db',
    'query',
    '--linked',
    '-f',
    'scripts/seed-staging-volume-100k.sql',
  ]);
} else {
  console.log('\n[3/5] Seed SKIP');
}

if (!skipSmoke) {
  console.log('\n[4/5] Smoke listagens + burst');
  run('node', ['scripts/run-load-on-staging.mjs', '--', 'scripts/load-test-listagens-escala-100k.mjs'], {
    env: { ISO_PRO_SMOKE_STAGING: '1', ISO_PRO_JWT_SKIP_TLS_VERIFY: '1' },
  });
  run('node', ['scripts/run-load-on-staging.mjs', '--', 'scripts/load-test-listagens-burst.mjs', '--parallel', '40'], {
    env: { ISO_PRO_SMOKE_STAGING: '1', ISO_PRO_JWT_SKIP_TLS_VERIFY: '1' },
  });
} else {
  console.log('\n[4/5] Smoke SKIP');
}

if (relinkLive) {
  console.log('\n[5/5] Re-link CLI → LIVE', ISO_PRO_LIVE_PROJECT_REF);
  run('npx', ['supabase', 'link', '--project-ref', ISO_PRO_LIVE_PROJECT_REF, '--yes']);
} else {
  console.log('\n[5/5] CLI continua em staging-load. Para LIVE:');
  console.log(`  npx supabase link --project-ref ${ISO_PRO_LIVE_PROJECT_REF}`);
}

console.log('\n=== Prova concluída ===');
console.log('Actualiza docs/LOAD-TEST-RESULTADOS.md com os números deste run.');
