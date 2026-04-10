import { createSign, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { DesktopLicensePayload } from '../src/modules/configuracoes/types/desktop-license.types';

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return process.argv[index + 1] ?? '';
}

function requireArg(flag: string) {
  const value = readArg(flag).trim();
  if (!value) {
    throw new Error(`Parametro obrigatorio ausente: ${flag}`);
  }
  return value;
}

function readOptionalArg(flag: string) {
  const value = readArg(flag).trim();
  return value || undefined;
}

function escapeSql(value: string) {
  return value.replace(/'/g, "''");
}

function resolvePrivateKey() {
  const inlinePrivateKey = readOptionalArg('--private-key');
  if (inlinePrivateKey) {
    return inlinePrivateKey;
  }

  const privateKeyFile = readOptionalArg('--private-key-file');
  if (privateKeyFile) {
    return readFileSync(privateKeyFile, 'utf8');
  }

  throw new Error('Informe --private-key ou --private-key-file para emitir a licenca.');
}

const privateKey = resolvePrivateKey();
const issuedTo = requireArg('--issued-to');
const machineFingerprint = requireArg('--machine-fingerprint');
const machineLabel = readOptionalArg('--machine-label');
const expiresAt = readOptionalArg('--expires-at');
const appVersion = readOptionalArg('--app-version');
const licenseId = readOptionalArg('--license-id') || randomUUID();
const outputFile = readOptionalArg('--output-file');

if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) {
  throw new Error('Parametro invalido: --expires-at precisa ser uma data valida.');
}

const payload: DesktopLicensePayload = {
  licenseId,
  issuedTo,
  machineFingerprint,
  machineLabel,
  issuedAt: new Date().toISOString(),
  expiresAt,
  appVersion,
  status: 'active',
};

const encodedPayload = toBase64Url(JSON.stringify(payload));
const signer = createSign('RSA-SHA256');
signer.update(encodedPayload);
signer.end();

const signature = signer.sign(privateKey);
const token = `${encodedPayload}.${toBase64Url(signature)}`;
const registrationSql = [
  'insert into public.desktop_licencas (',
  '    license_id,',
  '    issued_to,',
  '    machine_fingerprint,',
  '    machine_label,',
  '    app_version,',
  '    status,',
  '    emitida_em,',
  '    expira_em,',
  '    motivo_revogacao',
  ') values (',
  `    '${escapeSql(payload.licenseId)}',`,
  `    '${escapeSql(payload.issuedTo)}',`,
  `    '${escapeSql(payload.machineFingerprint)}',`,
  `    ${payload.machineLabel ? `'${escapeSql(payload.machineLabel)}'` : 'null'},`,
  `    ${payload.appVersion ? `'${escapeSql(payload.appVersion)}'` : 'null'},`,
  "    'active',",
  `    '${escapeSql(payload.issuedAt)}',`,
  `    ${payload.expiresAt ? `'${escapeSql(payload.expiresAt)}'` : 'null'},`,
  '    null',
  ')',
  'on conflict (license_id) do update',
  'set issued_to = excluded.issued_to,',
  '    machine_fingerprint = excluded.machine_fingerprint,',
  '    machine_label = excluded.machine_label,',
  '    app_version = excluded.app_version,',
  '    status = excluded.status,',
  '    emitida_em = excluded.emitida_em,',
  '    expira_em = excluded.expira_em,',
  '    motivo_revogacao = excluded.motivo_revogacao,',
  '    revogada_em = null,',
  '    updated_at = now();',
].join('\n');
const result = {
  token,
  payload,
  registrationSql,
};

if (outputFile) {
  writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
}

process.stdout.write(
  JSON.stringify(result, null, 2),
);
