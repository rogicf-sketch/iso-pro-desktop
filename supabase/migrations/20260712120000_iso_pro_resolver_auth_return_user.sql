-- JWT epic PR1 (sem cutover): resolver devolve `user` + jwtReady; opcional p_requer_modulo.
-- Clientes antigos (só email) continuam válidos; login passa a preferir JWT com fallback RPC.
-- NÃO revoga EXECUTE de anon em iso_pro_autenticar_usuario.

DROP FUNCTION IF EXISTS public.iso_pro_resolver_auth_email_sessao(uuid, text, text);

CREATE OR REPLACE FUNCTION public.iso_pro_resolver_auth_email_sessao(
  p_tenant_id uuid,
  p_login text,
  p_senha text,
  p_requer_modulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth jsonb;
  v_user jsonb;
  v_uid uuid;
  v_email text;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  v_auth := public.iso_pro_autenticar_usuario(p_tenant_id, p_login, p_senha, p_requer_modulo);
  IF coalesce((v_auth->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_auth;
  END IF;

  v_user := v_auth->'user';

  SELECT u.auth_user_id INTO v_uid
  FROM public.usuarios_sistema AS u
  WHERE u.tenant_id = p_tenant_id
    AND u.id::text = v_user->>'id'
    AND coalesce(u.ativo, false) = true;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'jwtReady', false,
      'user', v_user,
      'usuarioId', v_user->>'id',
      'error', 'Utilizador sem ligacao Supabase Auth (auth_user_id).'
    );
  END IF;

  SELECT au.email INTO v_email
  FROM auth.users AS au
  WHERE au.id = v_uid;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'jwtReady', false,
      'user', v_user,
      'usuarioId', v_user->>'id',
      'authUserId', v_uid::text,
      'error', 'Conta Auth sem email configurado.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'jwtReady', true,
    'authUserId', v_uid::text,
    'email', v_email,
    'usuarioId', v_user->>'id',
    'user', v_user
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text, text) IS
  'JWT PR1: autentica (RPC), devolve user + email Auth quando jwtReady; sem cutover anon.';

REVOKE ALL ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text, text) TO anon, authenticated;
