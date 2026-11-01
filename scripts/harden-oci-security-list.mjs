/**
 * Endurece a Default Security List do VCN ISO PRO (Free Tier OK):
 *  - garante TCP 80 + TCP 443 (0.0.0.0/0)
 *  - restringe SSH (22) ao IP público actual (/32)
 *  - preserva regras ICMP existentes
 *
 * Usa assinatura OCI (Node) + curl.exe (Schannel Windows) — contorna SSL partido do oci CLI/Python.
 *
 * Uso:
 *   node scripts/harden-oci-security-list.mjs
 *   node scripts/harden-oci-security-list.mjs --dry-run
 *   node scripts/harden-oci-security-list.mjs --ssh-cidr=187.88.61.126/32
 */
import { createHash, createSign, createPrivateKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SECURITY_LIST_ID =
  'ocid1.securitylist.oc1.sa-saopaulo-1.aaaaaaaac62aic5d4o6uorrcoij5n2rfn7djxsyxhhopytvdd3b44xdwxyuq';
const REGION = 'sa-saopaulo-1';
const IAAS_HOST = `iaas.${REGION}.oci.oraclecloud.com`;

const dryRun = process.argv.includes('--dry-run');
const sshCidrArg = process.argv.find((a) => a.startsWith('--ssh-cidr='))?.slice('--ssh-cidr='.length);

function loadOciConfig() {
  const cfgPath = path.join(os.homedir(), '.oci', 'config');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const sections = {};
  let section = 'DEFAULT';
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^\[(.+)\]$/);
    if (m) {
      section = m[1];
      sections[section] ??= {};
      continue;
    }
    sections[section] ??= {};
    const i = t.indexOf('=');
    if (i <= 0) continue;
    sections[section][t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  const out = sections.DEFAULT ?? sections.default ?? Object.values(sections)[0] ?? {};
  if (!out.user || !out.fingerprint || !out.tenancy || !out.key_file) {
    throw new Error('~/.oci/config incompleto (user/fingerprint/tenancy/key_file).');
  }
  return out;
}

function pemKey(keyFile) {
  const p = keyFile.replace(/^~/, os.homedir());
  return fs.readFileSync(p, 'utf8');
}

function sha256B64(buf) {
  return createHash('sha256').update(buf).digest('base64');
}

function signHeaders({ method, pathWithQuery, host, body, headersExtra, keyPem, keyId }) {
  const date = new Date().toUTCString();
  const headers = {
    date,
    host,
    ...(headersExtra ?? {}),
  };
  const signingNames = [];
  const lines = [];

  if (body != null) {
    const raw = Buffer.from(body, 'utf8');
    headers['content-length'] = String(raw.length);
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    headers['x-content-sha256'] = sha256B64(raw);
    signingNames.push('date', '(request-target)', 'host', 'content-length', 'content-type', 'x-content-sha256');
  } else {
    signingNames.push('date', '(request-target)', 'host');
  }

  for (const name of signingNames) {
    if (name === '(request-target)') {
      lines.push(`(request-target): ${method.toLowerCase()} ${pathWithQuery}`);
    } else {
      lines.push(`${name}: ${headers[name]}`);
    }
  }
  const signingString = lines.join('\n');
  const signer = createSign('RSA-SHA256');
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(createPrivateKey(keyPem)).toString('base64');
  headers.authorization = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${signingNames.join(
    ' ',
  )}",signature="${signature}"`;
  return headers;
}

function curlJson({ method, url, headers, body }) {
  const args = ['-sS', '-X', method, url];
  for (const [k, v] of Object.entries(headers)) {
    args.push('-H', `${k}: ${v}`);
  }
  const tmp = path.join(os.tmpdir(), `oci-body-${Date.now()}.json`);
  try {
    if (body != null) {
      fs.writeFileSync(tmp, body, 'utf8');
      args.push('--data-binary', `@${tmp}`);
    }
    args.push('-w', '\n__HTTP__%{http_code}');
    const out = execFileSync('curl.exe', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const idx = out.lastIndexOf('\n__HTTP__');
    const text = idx >= 0 ? out.slice(0, idx) : out;
    const code = idx >= 0 ? Number(out.slice(idx + '\n__HTTP__'.length)) : 0;
    return { code, text };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function ociRequest({ cfg, method, host, apiPath, bodyObj }) {
  const keyPem = pemKey(cfg.key_file);
  const keyId = `${cfg.tenancy}/${cfg.user}/${cfg.fingerprint}`;
  const body = bodyObj == null ? null : JSON.stringify(bodyObj);
  const headers = signHeaders({
    method,
    pathWithQuery: apiPath,
    host,
    body,
    keyPem,
    keyId,
  });
  const url = `https://${host}${apiPath}`;
  const { code, text } = curlJson({ method, url, headers, body });
  if (code < 200 || code >= 300) {
    throw new Error(`OCI ${method} ${apiPath} → HTTP ${code}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

function hasTcpIngress(rules, port) {
  return (rules ?? []).some((r) => {
    if (r.protocol !== '6') return false;
    const range = r.tcpOptions?.destinationPortRange;
    if (!range) return false;
    const min = Number(range.min);
    const max = Number(range.max);
    return min <= port && max >= port;
  });
}

function publicIp() {
  const out = execFileSync('curl.exe', ['-sS', 'https://api.ipify.org'], { encoding: 'utf8' }).trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(out)) throw new Error(`IP público inválido: ${out}`);
  return out;
}

function main() {
  const cfg = loadOciConfig();
  const myIp = publicIp();
  const sshCidr = sshCidrArg || `${myIp}/32`;
  console.log(`harden-oci: IP público=${myIp}  sshCidr=${sshCidr}  dryRun=${dryRun}`);

  const apiPath = `/20160918/securityLists/${SECURITY_LIST_ID}`;
  const current = ociRequest({ cfg, method: 'GET', host: IAAS_HOST, apiPath });
  const ingress = Array.isArray(current.ingressSecurityRules) ? [...current.ingressSecurityRules] : [];
  const egress = current.egressSecurityRules ?? [];

  console.log(`harden-oci: regras ingress actuais=${ingress.length}`);

  const next = [];
  // SSH: uma única regra restrita
  next.push({
    description: `SSH admin (${sshCidr})`,
    protocol: '6',
    source: sshCidr,
    sourceType: 'CIDR_BLOCK',
    isStateless: false,
    tcpOptions: { destinationPortRange: { min: 22, max: 22 } },
  });

  // HTTP/HTTPS públicos
  for (const port of [80, 443]) {
    next.push({
      description: port === 80 ? 'HTTP' : 'HTTPS',
      protocol: '6',
      source: '0.0.0.0/0',
      sourceType: 'CIDR_BLOCK',
      isStateless: false,
      tcpOptions: { destinationPortRange: { min: port, max: port } },
    });
  }

  // Preservar ICMP (e outras não-TCP) existentes
  for (const r of ingress) {
    if (r.protocol === '6') continue; // TCP reescrito acima
    next.push(r);
  }

  const before80 = hasTcpIngress(ingress, 80);
  const before443 = hasTcpIngress(ingress, 443);
  const sshOpenWorld = ingress.some(
    (r) =>
      r.protocol === '6' &&
      r.source === '0.0.0.0/0' &&
      Number(r.tcpOptions?.destinationPortRange?.min) === 22,
  );

  console.log(
    JSON.stringify(
      {
        before: { http80: before80, https443: before443, sshOpenWorld },
        afterIngressCount: next.length,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log('harden-oci: dry-run — sem UPDATE');
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  ociRequest({
    cfg,
    method: 'PUT',
    host: IAAS_HOST,
    apiPath,
    bodyObj: {
      displayName: current.displayName,
      ingressSecurityRules: next,
      egressSecurityRules: egress,
    },
  });
  console.log('harden-oci: OK — security list actualizada (80/443 + SSH restrito).');
  console.log('Atenção: se o teu IP mudar, actualiza a regra SSH (ou reexecuta este script).');
}

main();
