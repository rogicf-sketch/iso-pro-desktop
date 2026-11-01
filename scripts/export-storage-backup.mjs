/**
 * Export periódico dos buckets Storage (evidencias + pdfs) para pasta local/NAS.
 * PHYSICAL backup NÃO inclui estes ficheiros.
 *
 * Uso:
 *   npm run ops:export-storage -- --dry-run
 *   npm run ops:export-storage -- --out "D:\\Backups\\iso-pro-storage"
 *
 * Env (.env prod): VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY)
 */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUCKETS = ['evidencias', 'pdfs'];

function loadEnv() {
  const out = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (out[k] === undefined || out[k] === '') out[k] = v;
    }
  }
  return out;
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dryRun = process.argv.includes('--dry-run');
const env = loadEnv();
const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
const service = String(
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '',
).trim();
const stamp = new Date().toISOString().slice(0, 10);
const outRoot = path.resolve(
  arg('--out', path.join(root, 'release', 'storage-exports', stamp)),
);

console.log('=== Export Storage ISO PRO ===');
console.log('host:', url.replace(/^https?:\/\//, '').split('/')[0] || '(sem URL)');
console.log('mode:', dryRun ? 'dry-run (só lista)' : 'download');
console.log('out:', outRoot);

if (!url) {
  console.error('Falta VITE_SUPABASE_URL');
  process.exit(1);
}
if (!service) {
  console.error(
    'Falta SUPABASE_SERVICE_ROLE_KEY no .env (Dashboard → Settings → API → service_role).',
  );
  process.exit(1);
}

const sb = createClient(url, service, { auth: { persistSession: false } });

async function walk(bucket, prefix = '') {
  const acc = [];
  const { data, error } = await sb.storage.from(bucket).list(prefix || '', {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw new Error(`${bucket} list ${prefix}: ${error.message}`);
  for (const item of data || []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    const looksFile = item.id != null || item.metadata != null;
    if (!looksFile) {
      acc.push(...(await walk(bucket, full)));
    } else {
      acc.push({ path: full, size: Number(item.metadata?.size || 0) });
    }
  }
  return acc;
}

let totalFiles = 0;
let totalBytes = 0;
let downloaded = 0;
let failed = 0;

if (!dryRun) fs.mkdirSync(outRoot, { recursive: true });

for (const bucket of BUCKETS) {
  console.log(`\n-- bucket: ${bucket}`);
  let files;
  try {
    files = await walk(bucket, '');
  } catch (e) {
    console.warn(`  skip/erro: ${e.message || e}`);
    continue;
  }
  console.log(`  objectos: ${files.length}`);
  totalFiles += files.length;
  totalBytes += files.reduce((s, f) => s + f.size, 0);

  if (dryRun) {
    for (const f of files.slice(0, 5)) {
      console.log(`  · ${f.path} (${f.size} B)`);
    }
    if (files.length > 5) console.log(`  … +${files.length - 5} mais`);
    continue;
  }

  const destBucket = path.join(outRoot, bucket);
  for (const f of files) {
    const dest = path.join(destBucket, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const { data, error } = await sb.storage.from(bucket).download(f.path);
    if (error || !data) {
      console.warn(`  FAIL ${f.path}: ${error?.message || 'sem data'}`);
      failed += 1;
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(dest, buf);
    downloaded += 1;
  }
}

const manifest = {
  when: new Date().toISOString(),
  urlHost: url.replace(/^https?:\/\//, '').split('/')[0],
  buckets: BUCKETS,
  dryRun,
  totalFiles,
  totalBytes,
  downloaded,
  failed,
  outRoot: dryRun ? null : outRoot,
};
const manifestPath = path.join(
  dryRun ? path.join(root, 'release', 'storage-exports') : outRoot,
  dryRun ? `manifest-dry-${stamp}.json` : 'manifest.json',
);
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('\n=== Resumo ===');
console.log(JSON.stringify(manifest, null, 2));
console.log('manifest:', manifestPath);
if (failed) process.exit(2);
