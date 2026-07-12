/**
 * Valida formato do DSN Sentry no .env (não envia eventos).
 * Uso: node scripts/validate-sentry-dsn.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const out = {};
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** Formato clássico: https://<key>@<host>/<projectId> */
function isLikelySentryDsn(dsn) {
  try {
    const u = new URL(dsn);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (!u.username) return false;
    if (!u.hostname.includes('sentry') && !u.hostname.includes('ingest')) {
      /* hosts self-hosted também válidos se tiverem user + path numérico */
    }
    const project = u.pathname.replace(/^\//, '');
    return /^\d+$/.test(project);
  } catch {
    return false;
  }
}

const env = loadEnv();
const dsn = String(process.env.VITE_SENTRY_DSN ?? env.VITE_SENTRY_DSN ?? '').trim();

console.log('=== Validacao Sentry DSN (desktop) ===');
if (!dsn) {
  console.log('VITE_SENTRY_DSN ausente — modo console-only (OK para desenvolvimento).');
  console.log('Para activar: criar projecto em https://sentry.io → Client Keys (DSN)');
  console.log('  1) Colar em .env: VITE_SENTRY_DSN=https://...@....ingest.sentry.io/...');
  console.log('  2) Mobile: EXPO_PUBLIC_SENTRY_DSN=<mesmo ou projecto RN>');
  console.log('  3) Rebuild web/PC/APK');
  console.log('  4) Alertas: filtrar mensagens iso.snapshot_conflict | iso.dual_write_failure | iso.offline_flush');
  process.exit(0);
}

if (!isLikelySentryDsn(dsn)) {
  console.error('DSN com formato invalido:', dsn.replace(/\/\/.*@/, '//***@'));
  process.exit(1);
}

console.log('DSN formato OK:', dsn.replace(/\/\/[^@]+@/, '//***@'));
console.log('Proximos: rebuild + forçar erro de teste em staging + alertas iso.*');
