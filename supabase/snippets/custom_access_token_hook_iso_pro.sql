-- =============================================================================
-- I.S.O PRO — Custom Access Token Hook (Postgres) + claim `tenant_id`
-- =============================================================================
-- Documentação Supabase: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
--
-- Alinha com `public.iso_pro_jwt_tenant_id()` em `rls_auth_jwt_tenant_exemplo.sql`,
-- que lê primeiro `auth.jwt() ->> 'tenant_id'`.
--
-- DDL canónico (tabela + triggers + RPC): migração
--   `migrations/20260207130000_iso_pro_auth_membership_auto_sync.sql`
-- Ao definir `usuarios_sistema.auth_user_id`, a linha em `iso_pro_auth_membership`
-- é criada/atualizada automaticamente (trigger SECURITY DEFINER).
-- Ligação controlada por API: Edge Function `iso_pro_link_auth_user` (segredo no header).
--
-- Fluxo recomendado quando migrares o login para Supabase Auth:
--   1) Criar utilizador em `auth.users` (signUp / invite).
--   2) Chamar a Edge Function (ou RPC `iso_pro_set_usuario_auth_link` com service_role)
--      para associar o uuid Auth ao registo em `usuarios_sistema` do tenant certo.
--   3) Registar este hook no Dashboard: Authentication → Hooks → Custom Access Token.
--
-- A app desktop (versão actual) usa chave anon + sessão em `usuarios_sistema` sem JWT;
-- este ficheiro é só preparação para RLS + Auth.
-- =============================================================================

-- Mapeamento Auth (uuid) → empresa (tenant). Ajuste `usuario_sistema_id` ao tipo real da PK.
CREATE TABLE IF NOT EXISTS public.iso_pro_auth_membership (
  auth_user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants (id),
  usuario_sistema_id text NULL
);

CREATE INDEX IF NOT EXISTS idx_iso_pro_auth_membership_tenant_id
  ON public.iso_pro_auth_membership (tenant_id);

COMMENT ON TABLE public.iso_pro_auth_membership IS
  'Liga auth.users ao tenant ISO PRO; usado pelo Custom Access Token Hook para o claim tenant_id.';

ALTER TABLE public.iso_pro_auth_membership ENABLE ROW LEVEL SECURITY;

-- Sem políticas para anon/authenticated: só service role / auth admin administram via SQL.
-- Opcional: políticas SELECT para o próprio user depois de definires modelo de gestão.

GRANT SELECT ON public.iso_pro_auth_membership TO supabase_auth_admin;
REVOKE ALL ON public.iso_pro_auth_membership FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Hook: injeta `tenant_id` no topo do payload de claims (string UUID).
-- -----------------------------------------------------------------------------
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
        'message', 'Conta sem empresa ISO PRO associada. Contacte o administrador.'
      )
    );
  END IF;

  v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text), true);

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Supabase Auth: acrescenta claim tenant_id (string UUID) para RLS ISO PRO.';

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon, authenticated, public;

-- -----------------------------------------------------------------------------
-- Exemplo: associar um utilizador Auth a um tenant (executar uma vez por conta).
-- -----------------------------------------------------------------------------
-- INSERT INTO public.iso_pro_auth_membership (auth_user_id, tenant_id, usuario_sistema_id)
-- VALUES (
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid,
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   NULL
-- );
