-- ROLLBACK emergência: reabre RLS híbrido anon_compativel (tenant_id NOT NULL).
-- Só usar se login/sync partir após 20261025210000. Preferir hotfix pontual.
--
-- Depois: npx supabase db query --linked -f supabase/snippets/jwt_tabelas_rls_rollback_anon_compativel.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_rls_tenant_row_allowed(p_row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'authenticated' THEN p_row_tenant_id = public.iso_pro_jwt_tenant_id()
    ELSE p_row_tenant_id IS NOT NULL
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_rls_tenant_row_allowed(uuid) IS
  'ROLLBACK: RLS híbrido anon (tenant_id NOT NULL) + authenticated JWT.';

-- Nota: políticas *_authenticated_rls + REVOKE anon da migration forward
-- NÃO são revertidas automaticamente aqui. Se precisares de anon nas tabelas,
-- recria policies TO anon, authenticated com row_allowed e GRANT ao anon.

COMMIT;
