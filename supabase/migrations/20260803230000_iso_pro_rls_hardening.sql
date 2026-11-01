-- RLS endurecido: helper so para authenticated/service_role (anon = false).
-- Fecha policy aberta de iso_pro_atendimento_locks (USING true) se a tabela ainda existir.

CREATE OR REPLACE FUNCTION public.iso_pro_rls_tenant_authenticated_only(p_row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN true
    WHEN auth.role() = 'authenticated' THEN
      p_row_tenant_id IS NOT NULL
      AND p_row_tenant_id = public.iso_pro_jwt_tenant_id()
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_rls_tenant_authenticated_only(uuid) IS
  'RLS estrito: service_role ok; authenticated exige JWT tenant; anon sempre false.';

REVOKE ALL ON FUNCTION public.iso_pro_rls_tenant_authenticated_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_rls_tenant_authenticated_only(uuid)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.iso_pro_atendimento_locks') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.iso_pro_atendimento_locks ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS iso_pro_atendimento_locks_anon_all ON public.iso_pro_atendimento_locks;
  DROP POLICY IF EXISTS iso_pro_atendimento_locks_tenant_rls ON public.iso_pro_atendimento_locks;

  CREATE POLICY iso_pro_atendimento_locks_tenant_rls
    ON public.iso_pro_atendimento_locks
    FOR ALL
    TO authenticated, service_role
    USING (public.iso_pro_rls_tenant_authenticated_only(tenant_id))
    WITH CHECK (public.iso_pro_rls_tenant_authenticated_only(tenant_id));
END $$;
