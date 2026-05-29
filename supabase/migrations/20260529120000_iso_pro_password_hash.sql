-- I.S.O PRO — verificação de senha com suporte a bcrypt (pgcrypto) + legado texto plano.
-- Permite migração gradual: utilizadores existentes continuam a entrar até rehash no login.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.iso_pro_verificar_senha(p_senha_input text, p_senha_armazenada text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  IF p_senha_armazenada IS NULL OR p_senha_armazenada = '' THEN
    RETURN FALSE;
  END IF;
  IF left(p_senha_armazenada, 3) = '$2a' OR left(p_senha_armazenada, 3) = '$2b' OR left(p_senha_armazenada, 3) = '$2y' THEN
    RETURN p_senha_armazenada = crypt(p_senha_input, p_senha_armazenada);
  END IF;
  RETURN p_senha_armazenada = p_senha_input;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_verificar_senha(text, text) IS
  'Compara senha de entrada com valor armazenado (bcrypt via pgcrypto ou legado texto plano). Uso interno / RPCs service_role.';

REVOKE ALL ON FUNCTION public.iso_pro_verificar_senha(text, text) FROM PUBLIC;

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
      AND public.iso_pro_verificar_senha(p_actor_senha, coalesce(u.senha, ''))
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

COMMIT;
