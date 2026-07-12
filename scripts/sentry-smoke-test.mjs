/**
 * Envia iso.sentry_smoke_test via envelope HTTP (mesmo DSN do .env / deploy-web.env).
 * Uso: node scripts/sentry-smoke-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function parseSentryDsn(dsn) {
  try {
    const u = new URL(String(dsn ?? '').trim());
    const publicKey = decodeURIComponent(u.username || '');
    const projectId = u.pathname.replace(/^\//, '').replace(/\/$/, '');
    if (!publicKey || !u.host || !projectId) return null;
    return { publicKey, host: u.host, projectId };
  } catch {
    return null;
  }
}

function randomEventId() {
  return crypto.randomUUID().replace(/-/g, '');
}

const env = {
  ...loadEnvFile(path.join(root, '.env')),
  ...loadEnvFile(path.join(root, 'scripts', 'deploy-web.env')),
};
const dsn = String(process.env.VITE_SENTRY_DSN ?? env.VITE_SENTRY_DSN ?? '').trim();
const parsed = parseSentryDsn(dsn);
if (!parsed) {
  console.error('VITE_SENTRY_DSN ausente ou invalido.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const release = `iso-pro-desktop@${pkg.version}`;
const eventId = randomEventId();
const sentAt = new Date().toISOString();
const eventPayload = {
  event_id: eventId,
  timestamp: Math.floor(Date.now() / 1000),
  platform: 'javascript',
  level: 'warning',
  release,
  environment: 'production',
  sdk: { name: 'iso-pro.http-smoke', version: '1.0' },
  message: 'iso.sentry_smoke_test',
  tags: { iso_event: 'sentry_smoke_test', source: 'cli' },
  extra: { source: 'scripts/sentry-smoke-test.mjs', at: sentAt },
  exception: {
    values: [{ type: 'Error', value: 'iso.sentry_smoke_test' }],
  },
};
const payloadStr = JSON.stringify(eventPayload);
const body = [
  JSON.stringify({ event_id: eventId, sent_at: sentAt }),
  JSON.stringify({ type: 'event', length: Buffer.byteLength(payloadStr) }),
  payloadStr,
].join('\n');

const url = `https://${parsed.host}/api/${parsed.projectId}/envelope/`;
const auth = `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=iso-pro-desktop-http/1`;

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-sentry-envelope',
    'X-Sentry-Auth': auth,
  },
  body,
});

if (!res.ok) {
  console.error(`Sentry HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

console.log('=== Sentry smoke OK ===');
console.log(`event_id: ${eventId}`);
console.log(`host: ${parsed.host}`);
console.log(`project: ${parsed.projectId}`);
console.log('Confirme em https://sentry.io → Issues (filtro: iso.sentry_smoke_test) em ~1 min.');
