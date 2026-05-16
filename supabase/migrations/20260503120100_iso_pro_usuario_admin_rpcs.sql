-- I.S.O PRO — RPCs para validar "admin de utilizadores" no tenant (login+senha em usuarios_sistema).
-- Destinadas a Edge Functions com SUPABASE_SERVICE_ROLE_KEY (GRANT apenas a service_role).
-- Não activa RLS em usuarios_sistema: o cliente desktop actual usa anon + filtro tenant_id na app;
-- políticas "só admin" na tabela exigem JWT com tenant_id ou mutações só via Edge.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_usuario_administra_utilizadores(
  p_tenant_id uuid,
  p_actor_login text,
  p_actor_senha text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS u
    WHERE u.tenant_id = p_tenant_id
      AND lower(trim(u.login)) = lower(trim(p_actor_login))
      AND coalesce(u.senha, '') = coalesce(p_actor_senha, '')
      AND coalesce(u.ativo, false) = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.perfis_acesso AS pa
          WHERE pa.tenant_id = u.tenant_id
            AND pa.id::text = u.perfil_id::text
            AND lower(trim(pa.codigo)) = 'admin'
        )
        OR EXISTS (
          SELECT 1
          FROM public.usuario_permissoes AS up
          WHERE up.tenant_id = u.tenant_id
            AND up.usuario_id::text = u.id::text
            AND lower(trim(up.modulo)) = 'usuarios'
            AND lower(trim(up.acao)) = 'administrar'
            AND coalesce(up.permitido, false) = true
        )
      )
  );
$$;

COMMENT ON FUNCTION public.iso_pro_usuario_administra_utilizadores(uuid, text, text) IS
  'True se o utilizador (login+senha+tenant) existe, está activo e é admin (perfil codigo admin) ou tem permissão usuarios:administrar. Apenas service_role.';

REVOKE ALL ON FUNCTION public.iso_pro_usuario_administra_utilizadores(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_usuario_administra_utilizadores(uuid, text, text) TO service_role;

COMMIT;
