-- Validação pós 20260712020000 (só leitura)

SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mobile_logs_acesso'
ORDER BY policyname;

SELECT p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'iso_pro_escala_outbox_claim',
    'iso_pro_escala_outbox_process_one',
    'iso_pro_flush_escala_outbox',
    'iso_pro_escala_outbox_status'
  )
ORDER BY 1;
