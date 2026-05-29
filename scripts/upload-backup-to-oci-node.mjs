/**
 * Upload backup JSON para OCI Object Storage (Node + --use-system-ca).
 * Contorna SSLException do OCI CLI Python no Windows (Kaspersky/antivirus).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';
import {
  encodeObjectName,
  getObjectStorageNamespace,
  loadOciConfig,
  ociObjectStorageFetch,
} from './ociObjectStorageSign.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

loadEnvFile(path.join(__dirname, 'backup-oci.env'));

const bucket = String(process.env.OCI_BUCKET_NAME ?? 'iso-pro-backups').trim();
const prefix = String(process.env.OCI_PREFIX ?? 'iso-pro-snapshots').trim().replace(/^\/+|\/+$/g, '');
const backupDir = String(process.env.SNAPSHOT_EXPORT_DIR ?? path.join(projectRoot, 'backups')).trim();

if (!fs.existsSync(backupDir)) {
  console.error('[upload-backup-oci] Pasta backups inexistente. Rode: npm run snapshot:export');
  process.exit(1);
}

const exports = fs
  .readdirSync(backupDir)
  .filter((f) => /^iso-pro-snapshot-export-.*\.json$/i.test(f))
  .map((f) => ({ f, m: fs.statSync(path.join(backupDir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);

if (!exports.length) {
  console.error('[upload-backup-oci] Nenhum iso-pro-snapshot-export-*.json em backups/');
  process.exit(1);
}

const filePath = path.join(backupDir, exports[0].f);
const baseName = exports[0].f;
const now = new Date();
const datePart = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const objectName = `${prefix}/${datePart}/${baseName}`;

const cfg = loadOciConfig();
console.log('[upload-backup-oci] Region:', cfg.region);
console.log('[upload-backup-oci] A obter namespace...');
const ns = await getObjectStorageNamespace(cfg);
console.log('[upload-backup-oci] Namespace:', ns);
console.log('[upload-backup-oci] Bucket:   ', bucket);
console.log('[upload-backup-oci] Object:   ', objectName);
console.log('[upload-backup-oci] Ficheiro: ', filePath);

const body = fs.readFileSync(filePath);
const apiPath = `/n/${encodeURIComponent(ns)}/b/${encodeURIComponent(bucket)}/o/${encodeObjectName(objectName)}`;

const { res, text } = await ociObjectStorageFetch('PUT', apiPath, {
  cfg,
  body,
  contentType: 'application/json',
});

if (!res.ok) {
  console.error('[upload-backup-oci] Falhou HTTP', res.status, text);
  process.exit(1);
}

console.log('[upload-backup-oci] OK - upload concluido.');
if (text.trim()) console.log(text);
