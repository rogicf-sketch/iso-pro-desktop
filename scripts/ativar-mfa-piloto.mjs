/**
 * Activa MFA TOTP no utilizador Auth piloto (admin@isopro.local).
 * Gera o código TOTP a partir do segredo (sem app no telemóvel) e confirma o enroll.
 * Guarda o segredo em release/ (gitignored) para importar no authenticator.
 *
 * Uso:
 *   $env:ISO_PRO_PILOTO_SENHA = "..."
 *   npm run jwt:ativar-mfa-piloto
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

function base32ToBuffer(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = String(secret).toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const c of cleaned) {
    const val = alphabet.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secretBase32, stepSec = 30, digits = 6) {
  const key = base32ToBuffer(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const senha = String(process.env.ISO_PRO_PILOTO_SENHA ?? '').trim();
const email = String(process.env.ISO_PRO_PILOTO_EMAIL ?? 'admin@isopro.local').trim();

if (!url || !anon) {
  console.error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}
if (!senha) {
  console.error('Defina ISO_PRO_PILOTO_SENHA.');
  process.exit(1);
}

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('=== Activar MFA piloto (admin) ===');

const signIn = await supabase.auth.signInWithPassword({ email, password: senha });
if (signIn.error || !signIn.data.session) {
  console.error('SignIn falhou:', signIn.error?.message ?? 'sem sessao');
  process.exit(1);
}
console.log('1/4 SignIn OK');

const listed = await supabase.auth.mfa.listFactors();
if (listed.error) {
  console.error('listFactors:', listed.error.message);
  process.exit(1);
}
const verified = (listed.data?.totp ?? []).filter((f) => f.status === 'verified');
if (verified.length > 0) {
  console.log('MFA ja activo:', verified.map((f) => `${f.friendly_name ?? f.id} (${f.status})`).join(', '));
  console.log('=== MFA JA CONFIGURADO ===');
  process.exit(0);
}

// Remover factors pendentes (enrolls incompletos)
for (const f of listed.data?.totp ?? []) {
  if (f.status !== 'verified') {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
}

const enroll = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'I.S.O PRO admin',
});
if (enroll.error || !enroll.data?.id || !enroll.data.totp?.secret) {
  console.error('Enroll falhou:', enroll.error?.message ?? 'resposta incompleta');
  process.exit(1);
}

const factorId = enroll.data.id;
const secret = enroll.data.totp.secret;
const uri = enroll.data.totp.uri ?? '';
console.log('2/4 Enroll OK — factor', factorId);

const code = generateTotp(secret);
const challenge = await supabase.auth.mfa.challenge({ factorId });
if (challenge.error) {
  console.error('Challenge falhou:', challenge.error.message);
  process.exit(1);
}
const verify = await supabase.auth.mfa.verify({
  factorId,
  challengeId: challenge.data.id,
  code,
});
if (verify.error) {
  console.error('Verify falhou:', verify.error.message);
  process.exit(1);
}
console.log('3/4 Verify OK — MFA activado');

const releaseDir = path.join(root, 'release');
fs.mkdirSync(releaseDir, { recursive: true });
const outFile = path.join(releaseDir, 'ISO_PRO_MFA_ADMIN_TOTP.txt');
const body = [
  'I.S.O PRO — segredo MFA TOTP (admin Auth)',
  `email: ${email}`,
  `factorId: ${factorId}`,
  `secret (base32): ${secret}`,
  uri ? `otpauth: ${uri}` : '',
  '',
  'Importe este segredo no Google Authenticator / Microsoft Authenticator / 1Password.',
  'Nao partilhe este ficheiro. Pasta release/ esta no .gitignore.',
  `gerado: ${new Date().toISOString()}`,
].filter(Boolean).join('\n');
fs.writeFileSync(outFile, body, 'utf8');
console.log('4/4 Segredo guardado em', outFile);

const again = await supabase.auth.mfa.listFactors();
console.log(
  'Factors:',
  (again.data?.totp ?? []).map((f) => `${f.friendly_name}:${f.status}`).join(', ') || '(nenhum)',
);
console.log('');
console.log('=== MFA PILOTO OK ===');
console.log('Abra o ficheiro em release/ e adicione o segredo ao authenticator do telemovel.');
