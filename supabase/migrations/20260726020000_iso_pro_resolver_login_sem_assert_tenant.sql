-- Login multi-empresa: resolver Auth nao pode exigir claim do tenant destino.
--
-- Causa (26/07/2026, mobile Construcap): com JWT ainda activo de outra empresa
-- (ex.: Organizacao principal / Empresa ISO PRO), iso_pro_resolver_auth_email_sessao
-- chamava iso_pro_assert_tenant_caller → ISO_PRO_TENANT_FORBIDDEN antes de validar
-- login/senha. O utilizador nao conseguia entrar na Construcap.
--
-- O resolver e SECURITY DEFINER e autentica contra usuarios_sistema do p_tenant_id;
-- a proteccao de tenant fica no JWT apos signIn (membership + hook).

BEGIN;

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
  -- Nao chamar iso_pro_assert_tenant_caller aqui: o login e o momento de
  -- mudar de empresa; o JWT antigo (outro tenant) e esperado e deve ser
  -- substituido apos signInWithPassword.

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Empresa (tenant) em falta.');
  END IF;

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
  'JWT: autentica no tenant pedido e devolve email Auth; nao bloqueia por JWT antigo de outra empresa.';

REVOKE ALL ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text, text) TO anon, authenticated;

COMMIT;
