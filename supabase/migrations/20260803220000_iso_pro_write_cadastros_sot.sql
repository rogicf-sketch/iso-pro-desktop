-- Cadastros table-first (SoT): fornecedores, equipamentos, etiquetas.
-- Tabelas + projecao snapshot com skip_escala_outbox (OCC via p_baseline).

BEGIN;

-- ========== TABELAS ==========
CREATE TABLE IF NOT EXISTS public.iso_pro_fornecedores (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  nome text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.iso_pro_equipamentos (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS public.iso_pro_etiquetas (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS iso_pro_fornecedores_tenant_nome_idx
  ON public.iso_pro_fornecedores (tenant_id, lower(btrim(nome)));
CREATE INDEX IF NOT EXISTS iso_pro_fornecedores_tenant_ativo_idx
  ON public.iso_pro_fornecedores (tenant_id, ativo);
CREATE INDEX IF NOT EXISTS iso_pro_equipamentos_tenant_updated_idx
  ON public.iso_pro_equipamentos (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS iso_pro_etiquetas_tenant_updated_idx
  ON public.iso_pro_etiquetas (tenant_id, updated_at DESC);

-- ========== RLS ==========
ALTER TABLE public.iso_pro_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_etiquetas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_fornecedores_tenant_rls ON public.iso_pro_fornecedores;
CREATE POLICY iso_pro_fornecedores_tenant_rls
  ON public.iso_pro_fornecedores
  FOR ALL TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_fornecedores_service ON public.iso_pro_fornecedores;
CREATE POLICY iso_pro_fornecedores_service
  ON public.iso_pro_fornecedores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS iso_pro_equipamentos_tenant_rls ON public.iso_pro_equipamentos;
CREATE POLICY iso_pro_equipamentos_tenant_rls
  ON public.iso_pro_equipamentos
  FOR ALL TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_equipamentos_service ON public.iso_pro_equipamentos;
CREATE POLICY iso_pro_equipamentos_service
  ON public.iso_pro_equipamentos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS iso_pro_etiquetas_tenant_rls ON public.iso_pro_etiquetas;
CREATE POLICY iso_pro_etiquetas_tenant_rls
  ON public.iso_pro_etiquetas
  FOR ALL TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_etiquetas_service ON public.iso_pro_etiquetas;
CREATE POLICY iso_pro_etiquetas_service
  ON public.iso_pro_etiquetas
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_pro_fornecedores TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_pro_equipamentos TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_pro_etiquetas TO anon, authenticated, service_role;

-- ========== WRITE SoT: FORNECEDORES ==========
CREATE OR REPLACE FUNCTION public.iso_pro_write_fornecedores_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_id text;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NULL OR jsonb_typeof(p_replace_all) <> 'array' THEN
    RAISE EXCEPTION 'ISO_PRO_FORNECEDORES_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_arr := p_replace_all;

  DELETE FROM public.iso_pro_fornecedores WHERE tenant_id = p_tenant_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_arr)
  LOOP
    v_id := NULLIF(btrim(coalesce(v_elem->>'id', '')), '');
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;
    INSERT INTO public.iso_pro_fornecedores (
      tenant_id, id, nome, cnpj, telefone, email, endereco, ativo, payload, updated_at
    ) VALUES (
      p_tenant_id,
      v_id,
      coalesce(btrim(v_elem->>'nome'), ''),
      coalesce(btrim(v_elem->>'cnpj'), ''),
      coalesce(btrim(v_elem->>'telefone'), ''),
      coalesce(btrim(v_elem->>'email'), ''),
      coalesce(btrim(v_elem->>'endereco'), ''),
      coalesce((v_elem->>'ativo')::boolean, true),
      coalesce(v_elem, '{}'::jsonb),
      v_new
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      nome = EXCLUDED.nome,
      cnpj = EXCLUDED.cnpj,
      telefone = EXCLUDED.telefone,
      email = EXCLUDED.email,
      endereco = EXCLUDED.endereco,
      ativo = EXCLUDED.ativo,
      payload = EXCLUDED.payload,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('fornecedores', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('fornecedores', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('fornecedores', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  RETURN v_new;
END;
$$;

-- ========== WRITE SoT: EQUIPAMENTOS ==========
CREATE OR REPLACE FUNCTION public.iso_pro_write_equipamentos_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_id text;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NULL OR jsonb_typeof(p_replace_all) <> 'array' THEN
    RAISE EXCEPTION 'ISO_PRO_EQUIPAMENTOS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_arr := p_replace_all;

  DELETE FROM public.iso_pro_equipamentos WHERE tenant_id = p_tenant_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_arr)
  LOOP
    v_id := NULLIF(btrim(coalesce(v_elem->>'id', '')), '');
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;
    INSERT INTO public.iso_pro_equipamentos (tenant_id, id, payload, updated_at)
    VALUES (p_tenant_id, v_id, coalesce(v_elem, '{}'::jsonb), v_new)
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('equipamentos', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('equipamentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('equipamentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  RETURN v_new;
END;
$$;

-- ========== WRITE SoT: ETIQUETAS ==========
CREATE OR REPLACE FUNCTION public.iso_pro_write_etiquetas_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_id text;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NULL OR jsonb_typeof(p_replace_all) <> 'array' THEN
    RAISE EXCEPTION 'ISO_PRO_ETIQUETAS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_arr := p_replace_all;

  DELETE FROM public.iso_pro_etiquetas WHERE tenant_id = p_tenant_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_arr)
  LOOP
    v_id := NULLIF(btrim(coalesce(v_elem->>'id', '')), '');
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;
    INSERT INTO public.iso_pro_etiquetas (tenant_id, id, payload, updated_at)
    VALUES (p_tenant_id, v_id, coalesce(v_elem, '{}'::jsonb), v_new)
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('etiquetas', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('etiquetas', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('etiquetas', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_fornecedores_sot(uuid, timestamptz, jsonb) IS
  'SoT fornecedores: tabelas primeiro + projecao snapshot (sem outbox escala).';
COMMENT ON FUNCTION public.iso_pro_write_equipamentos_sot(uuid, timestamptz, jsonb) IS
  'SoT equipamentos: tabelas primeiro + projecao snapshot (sem outbox escala).';
COMMENT ON FUNCTION public.iso_pro_write_etiquetas_sot(uuid, timestamptz, jsonb) IS
  'SoT etiquetas: tabelas primeiro + projecao snapshot (sem outbox escala).';

REVOKE ALL ON FUNCTION public.iso_pro_write_fornecedores_sot(uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_fornecedores_sot(uuid, timestamptz, jsonb)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_write_equipamentos_sot(uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_equipamentos_sot(uuid, timestamptz, jsonb)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_write_etiquetas_sot(uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_etiquetas_sot(uuid, timestamptz, jsonb)
  TO anon, authenticated, service_role;

COMMIT;
