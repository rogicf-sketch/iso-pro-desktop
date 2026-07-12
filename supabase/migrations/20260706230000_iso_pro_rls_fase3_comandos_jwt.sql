-- Fase 3: RLS forte em comandos de atendimento + validação tenant nas RPCs + bootstrap JWT.
BEGIN;

-- Valida que pedidos authenticated respeitam o tenant do JWT.
CREATE OR REPLACE FUNCTION public.iso_pro_assert_tenant_caller(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_jwt uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF auth.role() = 'authenticated' THEN
    v_jwt := public.iso_pro_jwt_tenant_id();
    IF v_jwt IS NULL OR v_jwt <> p_tenant_id THEN
      RAISE EXCEPTION 'ISO_PRO_TENANT_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_assert_tenant_caller(uuid) IS
  'RLS Fase 3: em role authenticated exige claim tenant_id = p_tenant_id.';

REVOKE ALL ON FUNCTION public.iso_pro_assert_tenant_caller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_assert_tenant_caller(uuid) TO anon, authenticated;

-- RLS na tabela de auditoria de comandos
DO $$
BEGIN
  IF to_regclass('public.iso_pro_atendimento_comandos') IS NOT NULL THEN
    ALTER TABLE public.iso_pro_atendimento_comandos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS iso_pro_atendimento_comandos_anon_rw ON public.iso_pro_atendimento_comandos;
    DROP POLICY IF EXISTS iso_pro_atendimento_comandos_tenant_rls ON public.iso_pro_atendimento_comandos;
    CREATE POLICY iso_pro_atendimento_comandos_tenant_rls
      ON public.iso_pro_atendimento_comandos
      FOR ALL
      TO anon, authenticated
      USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
      WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));
  END IF;
END $$;

-- Reaplica política tenant_rls (idempotente) nas tabelas já cobertas + comandos
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'iso_pro_snapshot',
    'iso_pro_relatorio_snapshot',
    'usuarios_sistema',
    'dispositivos_mobile',
    'desktop_licencas',
    'materiais',
    'perfis_acesso',
    'usuario_permissoes',
    'perfil_permissoes',
    'iso_pro_atendimento_comandos'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_anon_rw', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_rls', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated '
        || 'USING (public.iso_pro_rls_tenant_row_allowed(tenant_id)) '
        || 'WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id))',
        t || '_tenant_rls',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Email Auth para bootstrap JWT (após validar senha RPC)
CREATE OR REPLACE FUNCTION public.iso_pro_resolver_auth_email_sessao(
  p_tenant_id uuid,
  p_login text,
  p_senha text
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

  v_auth := public.iso_pro_autenticar_usuario(p_tenant_id, p_login, p_senha, NULL);
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
      'ok', false,
      'jwtReady', false,
      'error', 'Utilizador sem ligacao Supabase Auth (auth_user_id).'
    );
  END IF;

  SELECT au.email INTO v_email
  FROM auth.users AS au
  WHERE au.id = v_uid;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'jwtReady', false,
      'error', 'Conta Auth sem email configurado.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'jwtReady', true,
    'authUserId', v_uid::text,
    'email', v_email,
    'usuarioId', v_user->>'id'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text) IS
  'Fase 3: devolve email Auth após autenticação RPC para signInWithPassword no cliente.';

REVOKE ALL ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_resolver_auth_email_sessao(uuid, text, text) TO anon, authenticated;

-- Estado RLS/JWT para painel admin
CREATE OR REPLACE FUNCTION public.iso_pro_auditar_rls_jwt_estado(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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

COMMENT ON FUNCTION public.iso_pro_auditar_rls_jwt_estado(uuid) IS
  'Painel admin: estado RLS/JWT da sessão actual.';

REVOKE ALL ON FUNCTION public.iso_pro_auditar_rls_jwt_estado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_auditar_rls_jwt_estado(uuid) TO anon, authenticated;

-- Guard tenant nas RPCs de comandos
CREATE OR REPLACE FUNCTION public.iso_pro_list_atendimento_comandos(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total bigint;
  v_pendentes bigint;
  v_sucesso_24h bigint;
  v_items jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT COUNT(*)::bigint
  INTO v_total
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id;

  SELECT COUNT(*)::bigint
  INTO v_pendentes
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.snapshot_updated_at IS NULL;

  SELECT COUNT(*)::bigint
  INTO v_sucesso_24h
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.snapshot_updated_at IS NOT NULL
    AND c.created_at >= now() - interval '24 hours';

  FOR v_row IN
    SELECT
      c.id,
      c.idempotency_key,
      c.baseline_updated_at,
      c.snapshot_updated_at,
      c.payload,
      c.created_at
    FROM public.iso_pro_atendimento_comandos AS c
    WHERE c.tenant_id = p_tenant_id
    ORDER BY c.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  LOOP
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'idempotencyKey', v_row.idempotency_key,
      'baselineUpdatedAt', v_row.baseline_updated_at,
      'snapshotUpdatedAt', v_row.snapshot_updated_at,
      'createdAt', v_row.created_at,
      'status',
        CASE
          WHEN v_row.snapshot_updated_at IS NOT NULL THEN 'ok'
          ELSE 'pendente'
        END,
      'historicoCount',
        CASE
          WHEN jsonb_typeof(v_row.payload->'atendimentoHistorico') = 'array'
            THEN jsonb_array_length(v_row.payload->'atendimentoHistorico')
          ELSE 0
        END,
      'documentosCount',
        CASE
          WHEN jsonb_typeof(v_row.payload->'documentos') = 'array'
            THEN jsonb_array_length(v_row.payload->'documentos')
          ELSE 0
        END,
      'origem',
        CASE
          WHEN v_row.idempotency_key LIKE 'pc-%' THEN 'pc'
          WHEN v_row.idempotency_key LIKE 'at-%' THEN 'mobile'
          WHEN v_row.idempotency_key LIKE 'reconcile-%' THEN 'reconciliacao'
          ELSE 'outro'
        END
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'pendentes', v_pendentes,
    'sucesso24h', v_sucesso_24h,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_submit_atendimento_comando(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_baseline timestamptz,
  p_documentos jsonb DEFAULT NULL,
  p_historico_novas jsonb DEFAULT NULL,
  p_lotes_novos jsonb DEFAULT NULL,
  p_sequencia_atendimento bigint DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing timestamptz;
  v_new timestamptz;
  v_payload jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_baseline IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.snapshot_updated_at
  INTO v_existing
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = btrim(p_idempotency_key)
  LIMIT 1;

  IF FOUND AND v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_new := public.iso_pro_registrar_atendimento_mobile(
    p_tenant_id,
    p_baseline,
    p_documentos,
    p_historico_novas,
    p_lotes_novos,
    p_sequencia_atendimento
  );

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'documentos', p_documentos,
    'atendimentoHistorico', p_historico_novas,
    'atendimentoLotes', p_lotes_novos,
    'sequenciaAtendimento', p_sequencia_atendimento
  ));

  INSERT INTO public.iso_pro_atendimento_comandos (
    tenant_id,
    idempotency_key,
    baseline_updated_at,
    payload,
    snapshot_updated_at
  )
  VALUES (
    p_tenant_id,
    btrim(p_idempotency_key),
    p_baseline,
    v_payload,
    v_new
  )
  ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
  SET snapshot_updated_at = COALESCE(public.iso_pro_atendimento_comandos.snapshot_updated_at, EXCLUDED.snapshot_updated_at)
  RETURNING snapshot_updated_at INTO v_existing;

  RETURN COALESCE(v_existing, v_new);
END;
$$;

COMMIT;
