/**
 * Activa alertas e-mail na LIVE: vault + pg_cron + pg_net (service role).
 * Não imprime segredos. Uso: node --use-system-ca scripts/activar-alertas-email-cron.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const env = { ...loadEnvFile(path.join(root, '.env')), ...process.env };
const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Falta VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const sql = `
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE SCHEMA IF NOT EXISTS vault;

DO $$
DECLARE
  v_url text := ${sqlLiteral(url)};
  v_key text := ${sqlLiteral(serviceKey)};
  v_id uuid;
BEGIN
  -- project url
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'iso_pro_project_url' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_url, 'iso_pro_project_url', 'I.S.O PRO project URL');
  ELSE
    PERFORM vault.update_secret(v_id, v_url, 'iso_pro_project_url', 'I.S.O PRO project URL');
  END IF;

  -- service role for edge cron calls
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'iso_pro_service_role_key' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_key, 'iso_pro_service_role_key', 'I.S.O PRO service role (cron alertas)');
  ELSE
    PERFORM vault.update_secret(v_id, v_key, 'iso_pro_service_role_key', 'I.S.O PRO service role (cron alertas)');
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
    'iso_pro_alerta_estoque_critico',
    'iso_pro_alerta_operacional'
  );
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

SELECT cron.schedule(
  'iso_pro_alerta_estoque_critico',
  '*/30 * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_project_url')
      || '/functions/v1/alerta_estoque_critico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_service_role_key'),
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_service_role_key')
    ),
    body := '{"modo":"cron"}'::jsonb
  ) AS request_id;
  $job$
);

SELECT cron.schedule(
  'iso_pro_alerta_operacional',
  '0 */6 * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_project_url')
      || '/functions/v1/alerta_operacional',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_service_role_key'),
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_service_role_key')
    ),
    body := '{"modo":"cron"}'::jsonb
  ) AS request_id;
  $job$
);

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('iso_pro_alerta_estoque_critico', 'iso_pro_alerta_operacional')
ORDER BY jobname;
`;

const sqlPath = path.join(
  process.env.TEMP || process.env.TMP || root,
  `iso-pro-activar-alertas-cron-${Date.now()}.sql`,
);
fs.writeFileSync(sqlPath, sql, 'utf8');

const r = spawnSync(
  'npx',
  ['supabase', 'db', 'query', '--linked', '-f', sqlPath],
  { cwd: root, encoding: 'utf8', shell: true },
);

try {
  fs.unlinkSync(sqlPath);
} catch {
  /* ignore */
}

if (r.stdout) process.stdout.write(r.stdout.replace(serviceKey, '[redacted]'));
if (r.stderr) process.stderr.write(r.stderr.replace(serviceKey, '[redacted]'));
process.exit(r.status ?? 1);
