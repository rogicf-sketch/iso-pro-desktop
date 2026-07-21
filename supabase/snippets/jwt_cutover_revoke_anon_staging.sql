-- JWT-only cutover — STAGING ONLY
-- Revoga EXECUTE anon em iso_pro_autenticar_usuario (todas as assinaturas).
-- Rollback: snippets/jwt_cutover_rollback_anon.sql

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'iso_pro_autenticar_usuario'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    RAISE NOTICE 'revoked anon on %', r.sig;
  END LOOP;
END $$;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'iso_pro_autenticar_usuario';
-- Esperado: anon_execute = false
