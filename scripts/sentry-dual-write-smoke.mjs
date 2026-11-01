/**
 * Envia iso.dual_write_failure de teste (tag iso_event) para validar a regra de alerta.
 * Uso: node scripts/sentry-dual-write-smoke.mjs
 *
 * Depois: Sentry → Issues → filtro message iso.dual_write_failure ou tag iso_event=dual_write_failure
 * Se a regra de alerta estiver ativa, deve notificar o email TI.
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
const eventId = crypto.randomUUID().replace(/-/g, '');
const sentAt = new Date().toISOString();
const eventPayload = {
  event_id: eventId,
  timestamp: Math.floor(Date.now() / 1000),
  platform: 'javascript',
  level: 'error',
  release,
  environment: 'production',
  sdk: { name: 'iso-pro.http-smoke', version: '1.0' },
  message: 'iso.dual_write_failure',
  tags: {
    iso_event: 'dual_write_failure',
    source: 'cli_smoke',
    smoke: 'true',
  },
  extra: {
    source: 'scripts/sentry-dual-write-smoke.mjs',
    at: sentAt,
    note: 'Evento de teste para validar alerta — pode ignorar/resolver apos confirmar email.',
  },
  exception: {
    values: [{ type: 'Error', value: 'iso.dual_write_failure' }],
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

console.log('=== Sentry dual_write_failure smoke OK ===');
console.log(`event_id: ${eventId}`);
console.log('1) Crie a regra (se ainda nao): Alerts → message contains iso.dual_write_failure');
console.log('   Link: https://iso-pro-gestao-de-materiais.sentry.io/alerts/rules/');
console.log('2) Issues → filtro iso.dual_write_failure (tag iso_event)');
console.log('3) Confirme email TI; depois Resolva o issue de smoke.');
