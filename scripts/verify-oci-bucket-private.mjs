/**
 * Verifica se o bucket OCI não permite leitura anónima (Object Storage público).
 * Uso: npm run backup:verify-bucket-private
 */
import { loadEnvFile } from './loadEnvFile.mjs';
import { getObjectStorageNamespace, loadOciConfig, ociObjectStorageFetch } from './ociObjectStorageSign.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, 'backup-oci.env'));

const bucket = String(process.env.OCI_BUCKET_NAME ?? 'iso-pro-backups').trim();
const cfg = loadOciConfig();

console.log('[verify-oci-bucket] Region:', cfg.region);
console.log('[verify-oci-bucket] Bucket:', bucket);

const ns = await getObjectStorageNamespace(cfg);
const apiPath = `/n/${encodeURIComponent(ns)}/b/${encodeURIComponent(bucket)}/o/`;

const { res, text } = await ociObjectStorageFetch('GET', apiPath, { cfg });
console.log('[verify-oci-bucket] Listagem autenticada HTTP', res.status);

if (!res.ok) {
  console.error('[verify-oci-bucket] Falha com credenciais OCI — confirme ~/.oci/config');
  process.exit(1);
}

const anonUrl = `https://objectstorage.${cfg.region}.oraclecloud.com${apiPath}`;
const anonRes = await fetch(anonUrl, { method: 'GET' });
console.log('[verify-oci-bucket] Pedido anonimo HTTP', anonRes.status);

if (anonRes.status === 200) {
  console.error('[verify-oci-bucket] ALERTA: bucket parece acessivel sem autenticacao.');
  console.error('  No console Oracle: Object Storage → bucket → visibilidade = Privado.');
  process.exit(1);
}

console.log('[verify-oci-bucket] OK — listagem anonima recusada (bucket privado ou sem ACL publica).');
if (text.length < 500) {
  console.log('[verify-oci-bucket] Resposta autenticada (truncada):', text.slice(0, 200));
}
