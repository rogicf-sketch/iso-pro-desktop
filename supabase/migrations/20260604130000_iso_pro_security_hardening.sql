-- I.S.O PRO — autenticação sem expor senha, tokens operacionais PDF, uso de materiais no snapshot.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Login RPC (senha verificada no servidor; cliente não lê coluna senha) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_autenticar_usuario(
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
    SET senha = crypt(p_senha, gen_salt('bf', 10))
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

COMMENT ON FUNCTION public.iso_pro_autenticar_usuario(uuid, text, text, text) IS
  'Autentica utilizador por tenant sem expor senha ao cliente. p_requer_modulo ex.: mobile.';

REVOKE ALL ON FUNCTION public.iso_pro_autenticar_usuario(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_autenticar_usuario(uuid, text, text, text) TO anon, authenticated;

-- ---------- Tokens operacionais (PDF / Edge sem reenviar senha) ----------
CREATE TABLE IF NOT EXISTS public.iso_pro_operational_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  usuario_id text NOT NULL,
  login text NOT NULL,
  nome text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iso_pro_operational_tokens_expires
  ON public.iso_pro_operational_tokens (expires_at);

ALTER TABLE public.iso_pro_operational_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iso_pro_operational_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_criar_token_operacional(
  p_tenant_id uuid,
  p_login text,
  p_senha text,
  p_ttl_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth jsonb;
  v_user jsonb;
  v_token uuid;
  v_ttl integer;
BEGIN
  v_auth := public.iso_pro_autenticar_usuario(p_tenant_id, p_login, p_senha, NULL);
  IF coalesce((v_auth->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_auth;
  END IF;

  v_user := v_auth->'user';
  v_ttl := greatest(5, least(coalesce(p_ttl_minutes, 30), 120));
  v_token := gen_random_uuid();

  DELETE FROM public.iso_pro_operational_tokens
  WHERE tenant_id = p_tenant_id
    AND usuario_id = v_user->>'id';

  INSERT INTO public.iso_pro_operational_tokens (token, tenant_id, usuario_id, login, nome, expires_at)
  VALUES (
    v_token,
    p_tenant_id,
    v_user->>'id',
    v_user->>'login',
    coalesce(v_user->>'nome', v_user->>'login'),
    now() + make_interval(mins => v_ttl)
  );

  RETURN jsonb_build_object(
    'ok',
    true,
    'token',
    v_token::text,
    'expiresAt',
    to_char(now() + make_interval(mins => v_ttl), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_criar_token_operacional(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_criar_token_operacional(uuid, text, text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_validar_token_operacional(
  p_tenant_id uuid,
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT t.usuario_id, t.login, t.nome
  INTO v_row
  FROM public.iso_pro_operational_tokens AS t
  WHERE t.token = p_token
    AND t.tenant_id = p_tenant_id
    AND t.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token operacional invalido ou expirado.');
  END IF;

  RETURN jsonb_build_object(
    'ok',
    true,
    'user',
    jsonb_build_object(
      'id',
      v_row.usuario_id,
      'login',
      v_row.login,
      'nome',
      v_row.nome
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_validar_token_operacional(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_validar_token_operacional(uuid, uuid) TO service_role;

-- ---------- Uso de materiais: tabela materiais + snapshot JSON ----------
DROP FUNCTION IF EXISTS public.iso_pro_materiais_uso_nos_modulos(bigint[]);

CREATE OR REPLACE FUNCTION public.iso_pro_materiais_uso_nos_modulos(
  p_tenant_id uuid,
  p_material_ids bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  r record;
  v_rec boolean;
  v_doc boolean;
  v_atd boolean;
  v_codigo_key text;
BEGIN
  IF p_material_ids IS NULL OR array_length(p_material_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT m.id AS material_id, trim(both FROM coalesce(m.codigo, '')) AS codigo
    FROM public.materiais AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.id = ANY (p_material_ids)
  LOOP
    v_codigo_key := lower(trim(r.codigo));
    v_rec := false;
    v_doc := false;
    v_atd := false;

    IF to_regclass('public.recebimento_itens') IS NOT NULL THEN
      EXECUTE $q$
        SELECT EXISTS (
          SELECT 1 FROM public.recebimento_itens ri
          WHERE ri.material_id = $1
        )
      $q$
      INTO v_rec
      USING r.material_id;
    END IF;

    IF to_regclass('public.documento_itens') IS NOT NULL THEN
      EXECUTE $q$
        SELECT EXISTS (
          SELECT 1 FROM public.documento_itens di
          WHERE di.material_id = $1
        )
      $q$
      INTO v_doc
      USING r.material_id;
    END IF;

    IF to_regclass('public.atendimento_itens') IS NOT NULL THEN
      EXECUTE $q$
        SELECT EXISTS (
          SELECT 1 FROM public.atendimento_itens ai
          WHERE ai.material_id = $1
        )
      $q$
      INTO v_atd
      USING r.material_id;
    END IF;

    IF p_tenant_id IS NOT NULL AND v_codigo_key <> '' AND to_regclass('public.iso_pro_snapshot') IS NOT NULL THEN
      IF NOT v_rec THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.iso_pro_snapshot AS s,
               jsonb_array_elements(coalesce(s.payload->'recebimentos', '[]'::jsonb)) AS rec,
               jsonb_array_elements(coalesce(rec->'itens', '[]'::jsonb)) AS it
          WHERE s.tenant_id = p_tenant_id
            AND lower(trim(coalesce(it->>'codigoMaterial', it->>'codigo', ''))) = v_codigo_key
        )
        INTO v_rec;
      END IF;

      IF NOT v_doc THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.iso_pro_snapshot AS s,
               jsonb_array_elements(coalesce(s.payload->'documentos', '[]'::jsonb)) AS doc,
               jsonb_array_elements(coalesce(doc->'itens', '[]'::jsonb)) AS it
          WHERE s.tenant_id = p_tenant_id
            AND lower(trim(coalesce(it->>'codigoMaterial', it->>'codigo', ''))) = v_codigo_key
        )
        INTO v_doc;
      END IF;

      IF NOT v_atd THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.iso_pro_snapshot AS s,
               jsonb_array_elements(coalesce(s.payload->'atendimentos', '[]'::jsonb)) AS atd,
               jsonb_array_elements(coalesce(atd->'itens', '[]'::jsonb)) AS it
          WHERE s.tenant_id = p_tenant_id
            AND lower(trim(coalesce(it->>'codigoMaterial', it->>'codigo', ''))) = v_codigo_key
        )
        INTO v_atd;
      END IF;
    END IF;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'material_id', r.material_id,
        'codigo', r.codigo,
        'recebimentos', v_rec,
        'documentos', v_doc,
        'atendimento', v_atd
      )
    );
  END LOOP;

  RETURN jsonb_build_object('items', coalesce(v_items, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.iso_pro_materiais_uso_nos_modulos(uuid, bigint[]) IS
  'Indica uso de materiais em modulos (tabelas relacionais e/ou iso_pro_snapshot).';

GRANT EXECUTE ON FUNCTION public.iso_pro_materiais_uso_nos_modulos(uuid, bigint[]) TO anon, authenticated;

COMMIT;
