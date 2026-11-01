-- =============================================================================
-- Auditoria: funções public.iso_pro_* com EXECUTE para role anon
-- Executar no SQL Editor (staging ou prod). Não altera permissões.
-- =============================================================================

SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  CASE
    WHEN p.proname IN (
      'iso_pro_resolver_auth_email_sessao',
      'iso_pro_resolver_auth_email'
    ) THEN 'MANTER — bootstrap login (anon resolve email → signIn)'
    WHEN p.proname = 'iso_pro_autenticar_usuario' THEN 'REVOGADO_ESPERADO — cutover JWT (anon_execute deve ser false)'
    WHEN p.proname LIKE '%assert_tenant%' OR p.proname LIKE '%auditar%' THEN 'MANTER — utilitário / diagnóstico'
    WHEN p.proname LIKE '%patch_snapshot%'
      OR p.proname LIKE '%submit_atendimento%'
      OR p.proname LIKE '%estornar%'
      OR p.proname LIKE '%replace_%'
      OR p.proname LIKE '%upsert_%' THEN 'CANDIDATO_REVOGAR — escrita operacional (após sessões 100% JWT)'
    WHEN p.proname LIKE '%read_%' OR p.proname LIKE '%list_%' OR p.proname LIKE '%sum_%'
      THEN 'CANDIDATO_REVOGAR — leitura (após sessões 100% JWT; RLS ainda aplica)'
    ELSE 'REVER — classificar manualmente'
  END AS recomendacao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'iso_pro_%'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY
  CASE
    WHEN p.proname = 'iso_pro_autenticar_usuario' THEN 0
    WHEN p.proname LIKE '%resolver_auth%' THEN 1
    WHEN p.proname LIKE '%patch%' OR p.proname LIKE '%submit%' OR p.proname LIKE '%estornar%' THEN 2
    ELSE 3
  END,
  p.proname;

-- Controlo cutover autenticar:
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'iso_pro_autenticar_usuario';
-- Esperado pós-cutover: anon_execute = false
