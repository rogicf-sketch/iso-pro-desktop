-- Validação pós 20260712010000 (só leitura)
-- Esperado: 0 policies *_insert/update/delete_anon com qual/with_check = true
-- nas tabelas de negócio com tenant_rls; login SELECT mantido.

SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
  AND tablename IN (
    'desktop_licencas',
    'dispositivos_mobile',
    'iso_pro_relatorio_snapshot',
    'iso_pro_snapshot',
    'materiais',
    'mobile_logs_acesso',
    'perfil_permissoes',
    'perfis_acesso',
    'usuario_permissoes',
    'usuarios_sistema'
  )
ORDER BY 1, 2;

SELECT p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'claim_pdf_job',
    'iso_pro_prune_retencao_ops',
    'iso_pro_set_usuario_auth_link',
    'iso_pro_autenticar_usuario',
    'iso_pro_escala_outbox_status'
  )
ORDER BY 1;
