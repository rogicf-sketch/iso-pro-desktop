-- =============================================================================
-- I.S.O PRO - Provisionar tenant Cliente 02 + utilizador admin
-- =============================================================================
-- Supabase SQL Editor, role postgres. Uma vez por projeto (se slug ainda nao existir).
-- Pre-requisitos: multi-tenant aplicado; erro codigo=admin: ../fix_perfis_acesso_codigo_por_tenant.sql
-- Ajuste v_slug / nome / login / senha antes de correr.
-- =============================================================================

DO $$
DECLARE
  v_default uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_new uuid := gen_random_uuid();
  v_slug text := 'cliente-02';
  v_nome_empresa text := 'Cliente 02';
  v_login text := 'admin.cliente02';
  v_nome_user text := 'Administrador';
  v_senha text := 'Alterar123!';
  v_perfil_origem_id public.perfis_acesso.id%TYPE;
  v_perfil_novo_id public.perfis_acesso.id%TYPE;
  v_insert_cols text;
  v_select_exprs text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.iso_pro_tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Slug já existe: %', v_slug;
  END IF;

  SELECT p.id INTO v_perfil_origem_id
  FROM public.perfis_acesso p
  WHERE p.tenant_id = v_default AND lower(trim(p.codigo)) = 'admin'
  ORDER BY p.id
  LIMIT 1;

  IF v_perfil_origem_id IS NULL THEN
    RAISE EXCEPTION 'Não foi encontrado perfil codigo=admin no tenant default.';
  END IF;

  INSERT INTO public.iso_pro_tenants (id, slug, name)
  VALUES (v_new, v_slug, v_nome_empresa);

  SELECT
    string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(
      CASE
        WHEN c.column_name = 'tenant_id' THEN quote_literal(v_new::text) || '::uuid'
        ELSE 'p.' || quote_ident(c.column_name)
      END,
      ', ' ORDER BY c.ordinal_position
    )
  INTO v_insert_cols, v_select_exprs
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'perfis_acesso'
    AND c.column_name <> 'id'
    AND COALESCE(c.is_generated, 'NEVER') <> 'ALWAYS';

  EXECUTE format(
    'INSERT INTO public.perfis_acesso (%s) SELECT %s FROM public.perfis_acesso p WHERE p.id = $1 RETURNING id',
    v_insert_cols,
    v_select_exprs
  )
  USING v_perfil_origem_id
  INTO v_perfil_novo_id;

  INSERT INTO public.perfil_permissoes (perfil_id, modulo, acao, permitido, tenant_id)
  SELECT v_perfil_novo_id, pp.modulo, pp.acao, pp.permitido, v_new
  FROM public.perfil_permissoes pp
  WHERE pp.perfil_id = v_perfil_origem_id;

  INSERT INTO public.usuarios_sistema (login, nome, senha, perfil_id, ativo, tenant_id)
  VALUES (lower(trim(v_login)), v_nome_user, v_senha, v_perfil_novo_id, true, v_new);

  RAISE NOTICE 'Tenant criado: id=% slug=% login=%', v_new, v_slug, lower(trim(v_login));
END $$;
