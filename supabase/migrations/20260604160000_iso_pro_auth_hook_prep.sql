-- Preparação Supabase Auth + claim tenant_id (activar o hook no Dashboard quando migrar login).
-- Não altera o fluxo actual anon+RPC; só garante funções e tabela para a fase JWT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_auth_membership (
  auth_user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants (id),
  usuario_sistema_id text NULL
);

CREATE INDEX IF NOT EXISTS idx_iso_pro_auth_membership_tenant_id
  ON public.iso_pro_auth_membership (tenant_id);

ALTER TABLE public.iso_pro_auth_membership ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.iso_pro_auth_membership FROM anon, authenticated;
GRANT SELECT ON public.iso_pro_auth_membership TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.iso_pro_jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT NULLIF(btrim(coalesce(
    auth.jwt() ->> 'tenant_id',
    auth.jwt() -> 'app_metadata' ->> 'tenant_id',
    auth.jwt() -> 'user_metadata' ->> 'tenant_id',
    ''
  )), '')::uuid;
$$;

COMMENT ON FUNCTION public.iso_pro_jwt_tenant_id() IS
  'Lê tenant_id do JWT. Usar em políticas RLS quando o login migrar para Supabase Auth.';

GRANT EXECUTE ON FUNCTION public.iso_pro_jwt_tenant_id() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
  v_user_id uuid;
  v_tenant uuid;
BEGIN
  v_claims := event->'claims';
  IF v_claims IS NULL OR jsonb_typeof(v_claims) <> 'object' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 500,
        'message', 'ISO PRO hook: claims invalidos.'
      )
    );
  END IF;

  v_user_id := NULLIF(trim(event->>'user_id'), '')::uuid;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 500,
        'message', 'ISO PRO hook: user_id em falta.'
      )
    );
  END IF;

  SELECT m.tenant_id INTO v_tenant
  FROM public.iso_pro_auth_membership AS m
  WHERE m.auth_user_id = v_user_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'ISO PRO: utilizador sem empresa (membership).'
      )
    );
  END IF;

  v_claims := v_claims || jsonb_build_object('tenant_id', v_tenant::text);
  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMIT;
