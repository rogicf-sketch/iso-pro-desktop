/**
 * Encriptação AES-256-GCM para backups Oracle (opcional).
 * Defina BACKUP_ENCRYPTION_KEY em scripts/backup-oci.env (64 hex = 32 bytes, ou passphrase).
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_N = 16384;

function parseKeyMaterial(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, 'hex');
  }
  return crypto.scryptSync(t, 'iso-pro-backup-v1', KEY_LEN, { N: SCRYPT_N });
}

export function backupEncryptionEnabled() {
  return parseKeyMaterial(process.env.BACKUP_ENCRYPTION_KEY) != null;
}

export function encryptBackupPayload(plainBuffer) {
  const key = parseKeyMaterial(process.env.BACKUP_ENCRYPTION_KEY);
  if (!key) {
    throw new Error('BACKUP_ENCRYPTION_KEY em falta para encriptar backup.');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('ISOPBK1'), iv, tag, encrypted]);
}

export function decryptBackupPayload(encBuffer) {
  const key = parseKeyMaterial(process.env.BACKUP_ENCRYPTION_KEY);
  if (!key) {
    throw new Error('BACKUP_ENCRYPTION_KEY em falta para desencriptar backup.');
  }
  const magic = encBuffer.subarray(0, 7).toString('utf8');
  if (magic !== 'ISOPBK1') {
    throw new Error('Ficheiro de backup encriptado invalido (magic ISOPBK1).');
  }
  let off = 7;
  const iv = encBuffer.subarray(off, off + IV_LEN);
  off += IV_LEN;
  const tag = encBuffer.subarray(off, off + TAG_LEN);
  off += TAG_LEN;
  const data = encBuffer.subarray(off);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
