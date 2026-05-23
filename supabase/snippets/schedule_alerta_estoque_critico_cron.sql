-- Agendamento do alerta de estoque critico na nuvem (pg_cron + pg_net).
-- Pre-requisitos:
--   1. Edge Function `alerta_estoque_critico` deployada (verify_jwt = false).
--   2. Secret `ISO_PRO_ALERTA_ESTOQUE_CRON_SECRET` na Edge Function (mesmo valor em Vault abaixo).
--   3. Config SMTP salva no app (Configuracoes → Alertas → Salvar).
--
-- Antes de executar, grave no Vault (SQL Editor) — substitua os valores:
--   select vault.create_secret('https://SEU_REF.supabase.co', 'iso_pro_project_url');
--   select vault.create_secret('SUA_ANON_KEY', 'iso_pro_anon_key');
--   select vault.create_secret('SEU_CRON_SECRET', 'iso_pro_alerta_estoque_cron_secret');
--
-- Depois execute o restante deste ficheiro.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'iso_pro_alerta_estoque_critico';

SELECT cron.schedule(
  'iso_pro_alerta_estoque_critico',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_project_url')
      || '/functions/v1/alerta_estoque_critico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_anon_key'),
      'x-iso-pro-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'iso_pro_alerta_estoque_cron_secret')
    ),
    body := '{"modo":"cron"}'::jsonb
  ) AS request_id;
  $$
);

SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'iso_pro_alerta_estoque_critico';
