-- I.S.O PRO — RLS + bloqueio de leitura da coluna senha via anon (mantém RPC e UPDATE admin).

BEGIN;

-- ---------- Coluna senha: anon não pode SELECT; UPDATE mantido para gestão de utilizadores ----------
DO $$
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NOT NULL THEN
    REVOKE SELECT (senha) ON public.usuarios_sistema FROM anon;
    REVOKE SELECT (senha) ON public.usuarios_sistema FROM authenticated;
    GRANT SELECT (senha) ON public.usuarios_sistema TO service_role;
  END IF;
END $$;

-- ---------- Refresh de sessão sem expor senha (substitui SELECT legacy no cliente) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_refresh_usuario_sessao(
  p_tenant_id uuid,
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_permissoes jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR trim(coalesce(p_user_id, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe tenant e utilizador.');
  END IF;

  SELECT
    u.id,
    u.login,
    u.nome,
    pa.id AS perfil_id,
    coalesce(pa.nome, pa.codigo, 'Perfil') AS perfil_nome
  INTO v_user
  FROM public.usuarios_sistema AS u
  LEFT JOIN public.perfis_acesso AS pa
    ON pa.tenant_id = u.tenant_id
   AND pa.id::text = u.perfil_id::text
  WHERE u.tenant_id = p_tenant_id
    AND u.id::text = trim(p_user_id)
    AND coalesce(u.ativo, false) = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Utilizador inativo ou inexistente.');
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

COMMENT ON FUNCTION public.iso_pro_refresh_usuario_sessao(uuid, text) IS
  'Revalida sessão desktop/mobile sem SELECT da coluna senha.';

REVOKE ALL ON FUNCTION public.iso_pro_refresh_usuario_sessao(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_refresh_usuario_sessao(uuid, text) TO anon, authenticated;

-- ---------- RLS nas tabelas críticas (auditoria + WITH CHECK tenant_id) ----------
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
    'perfil_permissoes'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- iso_pro_snapshot
DO $$
BEGIN
  IF to_regclass('public.iso_pro_snapshot') IS NOT NULL THEN
    DROP POLICY IF EXISTS iso_pro_snapshot_anon_rw ON public.iso_pro_snapshot;
    CREATE POLICY iso_pro_snapshot_anon_rw
      ON public.iso_pro_snapshot
      FOR ALL
      TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);

    DROP POLICY IF EXISTS iso_pro_snapshot_service_role ON public.iso_pro_snapshot;
    CREATE POLICY iso_pro_snapshot_service_role
      ON public.iso_pro_snapshot
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- iso_pro_relatorio_snapshot
DO $$
BEGIN
  IF to_regclass('public.iso_pro_relatorio_snapshot') IS NOT NULL THEN
    DROP POLICY IF EXISTS iso_pro_relatorio_snapshot_anon_rw ON public.iso_pro_relatorio_snapshot;
    CREATE POLICY iso_pro_relatorio_snapshot_anon_rw
      ON public.iso_pro_relatorio_snapshot
      FOR ALL
      TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
END $$;

-- usuarios_sistema: leitura/escrita com tenant obrigatório (isolamento parcial até JWT)
DO $$
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NOT NULL THEN
    DROP POLICY IF EXISTS usuarios_sistema_anon_rw ON public.usuarios_sistema;
    CREATE POLICY usuarios_sistema_anon_rw
      ON public.usuarios_sistema
      FOR ALL
      TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
END $$;

-- dispositivos_mobile
DO $$
BEGIN
  IF to_regclass('public.dispositivos_mobile') IS NOT NULL THEN
    DROP POLICY IF EXISTS dispositivos_mobile_anon_rw ON public.dispositivos_mobile;
    CREATE POLICY dispositivos_mobile_anon_rw
      ON public.dispositivos_mobile
      FOR ALL
      TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
END $$;

-- desktop_licencas
DO $$
BEGIN
  IF to_regclass('public.desktop_licencas') IS NOT NULL THEN
    DROP POLICY IF EXISTS desktop_licencas_anon_rw ON public.desktop_licencas;
    CREATE POLICY desktop_licencas_anon_rw
      ON public.desktop_licencas
      FOR ALL
      TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
END $$;

-- materiais + perfis + permissões
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['materiais', 'perfis_acesso', 'usuario_permissoes', 'perfil_permissoes']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_anon_rw ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_anon_rw ON public.%I FOR ALL TO anon, authenticated USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL)',
        t,
        t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
