import crypto from 'node:crypto';
import fs from 'node:fs';

/** Le ~/.oci/config (formato INI simples). */
export function loadOciConfig(configPath) {
  const path = configPath ?? `${process.env.USERPROFILE ?? process.env.HOME}/.oci/config`;
  if (!fs.existsSync(path)) {
    throw new Error(`Config OCI nao encontrado: ${path}`);
  }
  const cfg = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('[')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    cfg[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  for (const k of ['user', 'fingerprint', 'tenancy', 'region', 'key_file']) {
    if (!cfg[k]) throw new Error(`Config OCI incompleto: falta ${k}`);
  }
  return cfg;
}

function signingString(method, path, headers, headersToSign) {
  const lines = headersToSign.map((h) => {
    if (h === '(request-target)') return `(request-target): ${method.toLowerCase()} ${path}`;
    return `${h}: ${headers[h]}`;
  });
  return lines.join('\n');
}

/** Pedido assinado para Object Storage (usa fetch nativo + --use-system-ca no Node). */
export async function ociObjectStorageFetch(method, objectPath, { cfg, body, contentType = 'application/json' }) {
  const host = `objectstorage.${cfg.region}.oraclecloud.com`;
  const path = objectPath.startsWith('/') ? objectPath : `/${objectPath}`;
  const url = `https://${host}${path}`;
  const date = new Date().toUTCString();
  const headers = {
    host,
    date,
  };

  let headersToSign = ['(request-target)', 'host', 'date'];
  const init = { method, headers: { date } };

  if (body !== undefined && body !== null) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const sha256 = crypto.createHash('sha256').update(buf).digest('base64');
    headers['content-type'] = contentType;
    headers['content-length'] = String(buf.length);
    headers['x-content-sha256'] = sha256;
    headersToSign = ['(request-target)', 'host', 'date', 'x-content-sha256', 'content-type', 'content-length'];
    init.body = buf;
    init.headers['content-type'] = contentType;
    init.headers['content-length'] = String(buf.length);
    init.headers['x-content-sha256'] = sha256;
  }

  const keyId = `${cfg.tenancy}/${cfg.user}/${cfg.fingerprint}`;
  const privateKey = fs.readFileSync(cfg.key_file, 'utf8');
  const toSign = signingString(method, path, headers, headersToSign);
  const signature = crypto.sign('RSA-SHA256', Buffer.from(toSign), privateKey).toString('base64');
  const auth =
    `Signature version="1",` +
    `keyId="${keyId}",` +
    `algorithm="rsa-sha256",` +
    `headers="${headersToSign.join(' ')}",` +
    `signature="${signature}"`;

  init.headers.authorization = auth;
  init.headers.date = date;

  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text, url };
}

export async function getObjectStorageNamespace(cfg) {
  const { res, text } = await ociObjectStorageFetch('GET', '/n/', { cfg });
  if (!res.ok) throw new Error(`namespace HTTP ${res.status}: ${text}`);
  const data = JSON.parse(text);
  return data.data ?? data;
}

export function encodeObjectName(name) {
  return encodeURIComponent(name);
}
