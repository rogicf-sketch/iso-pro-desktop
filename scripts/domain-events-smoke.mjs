/**
 * Smoke P2 — prova que iso_pro_list_domain_events responde em prod/staging.
 *
 *   npm run domain-events:smoke
 *
 * Env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY | ISO_PRO_SERVICE_ROLE_KEY
 *   ISO_PRO_SMOKE_TENANT_ID | ISO_PRO_E2E_TENANT_ID (opcional)
 *
 * Nota: o `.env` local pode apontar para staging SP (`ofeogtjydjdjrmrekebh`);
 * prod linked é `huvktaxsosxrfpvdigxq`. Ambos precisam da migração list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadEnv() {
  const out = { ...process.env };
  for (const name of ['.env', '.env.staging']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      if (out[k] !== undefined && String(out[k]).length > 0) continue;
      out[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

function resolveTenantId(env) {
  const raw = String(env.ISO_PRO_SMOKE_TENANT_ID || env.ISO_PRO_E2E_TENANT_ID || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!raw) return { tenant: DEFAULT_TENANT, source: 'default' };
  if (!UUID_RE.test(raw)) {
    return { tenant: DEFAULT_TENANT, source: 'default_invalid_env' };
  }
  return { tenant: raw, source: 'env' };
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.ISO_PRO_SERVICE_ROLE_KEY;
const { tenant: TENANT, source: TENANT_SOURCE } = resolveTenantId(env);

console.log('=== domain-events:smoke ===');

if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY / ISO_PRO_SERVICE_ROLE_KEY.');
  process.exitCode = 2;
} else {
  try {
    console.log(`url_host: ${new URL(url).hostname}`);
  } catch {
    console.log('url_host: (invalid)');
  }
  console.log(`tenant: ${TENANT} (source=${TENANT_SOURCE})`);

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('iso_pro_list_domain_events', {
    p_tenant_id: TENANT,
    p_limit: 20,
  });

  if (error) {
    console.error('RPC iso_pro_list_domain_events falhou:', error.message);
    if (/does not exist|PGRST202|404/i.test(error.message)) {
      console.error('→ Aplica a migração 20260806020000_iso_pro_list_domain_events.sql (db push).');
      console.error(
        '→ Confirma que VITE_SUPABASE_URL é o projecto certo (prod huvktaxsosxrfpvdigxq ou staging ofeogtjydjdjrmrekebh).',
      );
    }
    process.exitCode = 1;
  } else {
    const raw = data && typeof data === 'object' ? data : {};
    if (typeof raw._error === 'string' && raw._error) {
      console.error('RPC devolveu _error:', raw._error);
      process.exitCode = 1;
    } else {
      const events = Array.isArray(raw.events) ? raw.events : [];
      const count = typeof raw._count === 'number' ? raw._count : events.length;

      console.log(`ok: RPC respondeu · _count=${count} · amostra=${events.length}`);

      if (count === 0) {
        console.log('0 eventos — gera 1 write na app (ex.: editar material) e re-corre.');
      } else {
        for (const e of events.slice(0, 10)) {
          const when = e?.created_at ?? '?';
          const type = e?.event_type ?? '?';
          const entity = [e?.entity_type, e?.entity_id].filter(Boolean).join(':') || '-';
          const actor = e?.actor_login ?? '-';
          console.log(`  ${when}  ${type}  ${entity}  actor=${actor}`);
        }
      }
    }
  }
}
