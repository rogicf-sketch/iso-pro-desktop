-- Supabase instala pgcrypto no schema "extensions". Funções com search_path=public não encontram crypt().
-- Corrige iso_pro_verificar_senha e rehash em iso_pro_autenticar_usuario.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.iso_pro_verificar_senha(p_senha_input text, p_senha_armazenada text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
BEGIN
  IF p_senha_armazenada IS NULL OR p_senha_armazenada = '' THEN
    RETURN FALSE;
  END IF;
  IF left(p_senha_armazenada, 3) = '$2a' OR left(p_senha_armazenada, 3) = '$2b' OR left(p_senha_armazenada, 3) = '$2y' THEN
    RETURN p_senha_armazenada = extensions.crypt(p_senha_input, p_senha_armazenada);
  END IF;
  RETURN p_senha_armazenada = p_senha_input;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_verificar_senha(text, text) FROM PUBLIC;

-- Reaplica autenticar_usuario com gen_salt/crypt qualificados (rehash no login).
CREATE OR REPLACE FUNCTION public.iso_pro_autenticar_usuario(
  p_tenant_id uuid,
  p_login text,
  p_senha text,
  p_requer_modulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user record;
  v_permissoes jsonb := '[]'::jsonb;
  v_has_modulo boolean := true;
  v_mod text;
BEGIN
  IF p_tenant_id IS NULL OR trim(coalesce(p_login, '')) = '' OR trim(coalesce(p_senha, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe tenant, login e senha.');
  END IF;

  SELECT
    u.id,
    u.login,
    u.nome,
    u.senha,
    pa.id AS perfil_id,
    coalesce(pa.nome, pa.codigo, 'Perfil') AS perfil_nome
  INTO v_user
  FROM public.usuarios_sistema AS u
  LEFT JOIN public.perfis_acesso AS pa
    ON pa.tenant_id = u.tenant_id
   AND pa.id::text = u.perfil_id::text
  WHERE u.tenant_id = p_tenant_id
    AND lower(trim(u.login)) = lower(trim(p_login))
    AND coalesce(u.ativo, false) = true;

  IF NOT FOUND OR NOT public.iso_pro_verificar_senha(p_senha, coalesce(v_user.senha, '')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Login ou senha invalidos.');
  END IF;

  IF left(coalesce(v_user.senha, ''), 3) NOT IN ('$2a', '$2b', '$2y') THEN
    UPDATE public.usuarios_sistema
    SET senha = extensions.crypt(p_senha, extensions.gen_salt('bf', 10))
    WHERE id = v_user.id
      AND tenant_id = p_tenant_id;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'modulo', lower(trim(up.modulo)),
        'acao', lower(trim(up.acao)),
        'permitido', coalesce(up.permitido, false)
      )
    ),
    '[]'::jsonb
  )
  INTO v_permissoes
  FROM (
    SELECT up.modulo, up.acao, up.permitido
    FROM public.usuario_permissoes AS up
    WHERE up.tenant_id = p_tenant_id
      AND up.usuario_id::text = v_user.id::text
    UNION ALL
    SELECT pp.modulo, pp.acao, pp.permitido
    FROM public.perfil_permissoes AS pp
    WHERE pp.tenant_id = p_tenant_id
      AND pp.perfil_id::text = v_user.perfil_id::text
      AND NOT EXISTS (
        SELECT 1
        FROM public.usuario_permissoes AS up2
        WHERE up2.tenant_id = p_tenant_id
          AND up2.usuario_id::text = v_user.id::text
      )
  ) AS up;

  v_mod := lower(trim(coalesce(p_requer_modulo, '')));
  IF v_mod <> '' THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_permissoes) AS elem
      WHERE lower(trim(elem->>'modulo')) = v_mod
        AND coalesce((elem->>'permitido')::boolean, false) = true
    )
    INTO v_has_modulo;

    IF NOT v_has_modulo THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'Seu perfil nao tem acesso ao modulo solicitado.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',
    true,
    'user',
    jsonb_build_object(
      'id',
      v_user.id::text,
      'login',
      v_user.login,
      'nome',
      coalesce(v_user.nome, v_user.login),
      'perfil',
      jsonb_build_object(
        'id',
        coalesce(v_user.perfil_id::text, ''),
        'nome',
        coalesce(v_user.perfil_nome, 'Perfil')
      ),
      'permissoes',
      v_permissoes
    )
  );
END;
$$;

COMMIT;
