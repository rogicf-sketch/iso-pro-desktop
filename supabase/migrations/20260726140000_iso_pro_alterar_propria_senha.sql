-- Self-service: qualquer utilizador activo pode alterar a própria senha (com senha actual).
-- Não exige permissão de administrar utilizadores.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_alterar_propria_senha(
  p_tenant_id uuid,
  p_login text,
  p_senha_atual text,
  p_senha_nova text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_senha_armazenada text;
  v_nova text;
BEGIN
  IF p_tenant_id IS NULL
     OR trim(coalesce(p_login, '')) = ''
     OR coalesce(p_senha_atual, '') = ''
     OR coalesce(p_senha_nova, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe tenant, login, senha actual e senha nova.');
  END IF;

  IF char_length(trim(p_senha_nova)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A senha nova deve ter pelo menos 4 caracteres.');
  END IF;

  SELECT u.id, coalesce(u.senha, '')
  INTO v_user_id, v_senha_armazenada
  FROM public.usuarios_sistema AS u
  WHERE u.tenant_id = p_tenant_id
    AND lower(trim(u.login)) = lower(trim(p_login))
    AND coalesce(u.ativo, false) = true;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Utilizador nao encontrado ou inactivo.');
  END IF;

  IF NOT public.iso_pro_verificar_senha(p_senha_atual, v_senha_armazenada) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Senha actual incorrecta.');
  END IF;

  v_nova := extensions.crypt(trim(p_senha_nova), extensions.gen_salt('bf', 10));

  UPDATE public.usuarios_sistema
  SET senha = v_nova
  WHERE id = v_user_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_alterar_propria_senha(uuid, text, text, text) IS
  'Altera a senha do proprio utilizador apos validar a senha actual (self-service).';

REVOKE ALL ON FUNCTION public.iso_pro_alterar_propria_senha(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_alterar_propria_senha(uuid, text, text, text) TO anon, authenticated, service_role;

COMMIT;
