/**
 * Gera ~/.oci/config + chave RSA para backup OCI no Windows.
 * Depois de rodar: cole oci_api_key_public.pem no console Oracle (Chaves de API).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const USER_OCID =
  process.env.OCI_USER_OCID ??
  'ocid1.user.oc1..aaaaaaaac4j6etmfnzcr7szi5agpcolulirxwa7coado4zwfbqp3u7jz72sa';
const TENANCY_OCID =
  process.env.OCI_TENANCY_OCID ??
  'ocid1.tenancy.oc1..aaaaaaaacn36ckpfklbwzamszqcrmjilhuwru6thbngvvqwt4x6qxtspn5na';
const REGION = process.env.OCI_REGION ?? 'sa-saopaulo-1';

const ociDir = path.join(os.homedir(), '.oci');
fs.mkdirSync(ociDir, { recursive: true });

const privatePemPath = path.join(ociDir, 'oci_api_key.pem');
const publicPemPath = path.join(ociDir, 'oci_api_key_public.pem');
const configPath = path.join(ociDir, 'config');
const instrucoesPath = path.join(ociDir, 'COLE-CHAVE-PUBLICA-NO-CONSOLE.txt');

if (fs.existsSync(privatePemPath) && fs.existsSync(configPath)) {
  console.log('[gerar-oci-config] Ja existe config em', ociDir);
  console.log('  Chave publica:', publicPemPath);
  process.exit(0);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const pubDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
const fingerprint = crypto
  .createHash('md5')
  .update(pubDer)
  .digest('hex')
  .replace(/(.{2})/g, '$1:')
  .slice(0, -1);

const keyFileWin = privatePemPath.replace(/\\/g, '/');
const config = `[DEFAULT]
user=${USER_OCID}
fingerprint=${fingerprint}
tenancy=${TENANCY_OCID}
region=${REGION}
key_file=${keyFileWin}
`;

fs.writeFileSync(privatePemPath, privateKey, { mode: 0o600 });
fs.writeFileSync(publicPemPath, publicKey, 'utf8');
fs.writeFileSync(configPath, config, 'utf8');

const instrucoes = `I.S.O PRO — Chave API Oracle (falta 1 passo no navegador)
============================================================

1. Abra: https://cloud.oracle.com/identity/users/ocid1.user.oc1..aaaaaaaac4j6etmfnzcr7szi5agpcolulirxwa7coado4zwfbqp3u7jz72sa/api-keys
   (Ou: Perfil > Configuracoes do usuario > Chaves de API > Adicionar chave publica)

2. Cole TODO o conteudo do ficheiro:
   ${publicPemPath}

3. Clique Adicionar / Save

4. No PowerShell (pasta iso-pro-desktop):
   oci os ns get
   npm run backup:upload-oci

Chave publica (copie abaixo):
------------------------------
${publicKey}
`;

fs.writeFileSync(instrucoesPath, instrucoes, 'utf8');

console.log('[gerar-oci-config] OK');
console.log('  Config:', configPath);
console.log('  Chave privada:', privatePemPath);
console.log('  Chave publica:', publicPemPath);
console.log('  Instrucoes:', instrucoesPath);
console.log('');
console.log('PROXIMO PASSO: cole a chave publica no console Oracle (link no ficheiro de instrucoes).');
