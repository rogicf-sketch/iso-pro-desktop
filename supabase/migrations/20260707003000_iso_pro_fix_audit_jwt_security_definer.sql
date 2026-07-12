-- Corrige painel admin: iso_pro_auditar_rls_jwt_estado precisa ler membership (tabela sem GRANT authenticated).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_auditar_rls_jwt_estado(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(auth.role(), 'none');
  v_jwt uuid := public.iso_pro_jwt_tenant_id();
  v_comandos_rls boolean := false;
  v_comandos_total bigint := 0;
  v_memberships bigint := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF to_regclass('public.iso_pro_atendimento_comandos') IS NOT NULL THEN
    SELECT c.relrowsecurity INTO v_comandos_rls
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'iso_pro_atendimento_comandos';

    SELECT COUNT(*)::bigint INTO v_comandos_total
    FROM public.iso_pro_atendimento_comandos AS c
    WHERE c.tenant_id = p_tenant_id;
  END IF;

  SELECT COUNT(*)::bigint INTO v_memberships
  FROM public.iso_pro_auth_membership AS m
  WHERE m.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'authRole', v_role,
    'jwtTenantId', v_jwt,
    'jwtAtivo', v_role = 'authenticated' AND v_jwt IS NOT NULL,
    'jwtAlinhado', v_jwt IS NOT NULL AND v_jwt = p_tenant_id,
    'comandosRls', coalesce(v_comandos_rls, false),
    'comandosTotal', coalesce(v_comandos_total, 0),
    'authMemberships', coalesce(v_memberships, 0),
    'modo',
      CASE
        WHEN v_role = 'authenticated' AND v_jwt = p_tenant_id THEN 'jwt_forte'
        WHEN v_role = 'authenticated' THEN 'jwt_desalinhado'
        ELSE 'anon_compativel'
      END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_auditar_rls_jwt_estado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_auditar_rls_jwt_estado(uuid) TO anon, authenticated;

COMMIT;
