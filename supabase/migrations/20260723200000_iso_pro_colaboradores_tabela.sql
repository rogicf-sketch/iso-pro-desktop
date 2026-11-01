-- Colaboradores em tabela (SoT) + sync snapshot + listagem paginada.
BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_colaboradores (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  id text NOT NULL,
  nome text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'interno'
    CHECK (tipo IN ('interno', 'externo')),
  matricula text NOT NULL DEFAULT '',
  funcao text NOT NULL DEFAULT '',
  empresa text NOT NULL DEFAULT '',
  documento text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS iso_pro_colaboradores_tenant_nome_idx
  ON public.iso_pro_colaboradores (tenant_id, lower(btrim(nome)));
CREATE INDEX IF NOT EXISTS iso_pro_colaboradores_tenant_ativo_idx
  ON public.iso_pro_colaboradores (tenant_id, ativo);
CREATE INDEX IF NOT EXISTS iso_pro_colaboradores_tenant_tipo_idx
  ON public.iso_pro_colaboradores (tenant_id, tipo);

ALTER TABLE public.iso_pro_colaboradores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'iso_pro_colaboradores'
      AND policyname = 'iso_pro_colaboradores_tenant_rls'
  ) THEN
    CREATE POLICY iso_pro_colaboradores_tenant_rls
      ON public.iso_pro_colaboradores
      FOR ALL
      USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
      WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_pro_colaboradores TO anon, authenticated, service_role;

-- Backfill a partir do snapshot JSON.
CREATE OR REPLACE FUNCTION public.iso_pro_sync_colaboradores_from_snapshot(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_arr jsonb;
  v_elem jsonb;
  v_n int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  v_arr := coalesce(v_payload->'colaboradores', '[]'::jsonb);
  IF jsonb_typeof(v_arr) <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'colaboradores', 0);
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_arr)
  LOOP
    INSERT INTO public.iso_pro_colaboradores (
      tenant_id, id, nome, tipo, matricula, funcao, empresa, documento, telefone, observacao, ativo, updated_at
    ) VALUES (
      p_tenant_id,
      coalesce(nullif(btrim(v_elem->>'id'), ''), gen_random_uuid()::text),
      coalesce(btrim(v_elem->>'nome'), ''),
      CASE WHEN lower(btrim(coalesce(v_elem->>'tipo', ''))) = 'externo' THEN 'externo' ELSE 'interno' END,
      coalesce(btrim(v_elem->>'matricula'), ''),
      coalesce(btrim(v_elem->>'funcao'), ''),
      coalesce(btrim(v_elem->>'empresa'), ''),
      coalesce(btrim(v_elem->>'documento'), ''),
      coalesce(btrim(v_elem->>'telefone'), ''),
      coalesce(btrim(v_elem->>'observacao'), ''),
      coalesce((v_elem->>'ativo')::boolean, true),
      now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      nome = EXCLUDED.nome,
      tipo = EXCLUDED.tipo,
      matricula = EXCLUDED.matricula,
      funcao = EXCLUDED.funcao,
      empresa = EXCLUDED.empresa,
      documento = EXCLUDED.documento,
      telefone = EXCLUDED.telefone,
      observacao = EXCLUDED.observacao,
      ativo = EXCLUDED.ativo,
      updated_at = now();
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'colaboradores', v_n);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_colaboradores_from_snapshot(uuid) IS
  'Backfill iso_pro_colaboradores a partir do array no snapshot.';

REVOKE ALL ON FUNCTION public.iso_pro_sync_colaboradores_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sync_colaboradores_from_snapshot(uuid)
  TO anon, authenticated, service_role;

-- Substitui o cadastro do tenant (gravação PC) e projecta no snapshot para legado.
CREATE OR REPLACE FUNCTION public.iso_pro_replace_colaboradores(
  p_tenant_id uuid,
  p_items jsonb,
  p_baseline timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
  v_wire jsonb := '[]'::jsonb;
  v_new timestamptz := now();
  v_id text;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'ISO_PRO_COLABORADORES_INVALID' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.iso_pro_colaboradores WHERE tenant_id = p_tenant_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id := coalesce(nullif(btrim(v_elem->>'id'), ''), gen_random_uuid()::text);
    INSERT INTO public.iso_pro_colaboradores (
      tenant_id, id, nome, tipo, matricula, funcao, empresa, documento, telefone, observacao, ativo, updated_at
    ) VALUES (
      p_tenant_id,
      v_id,
      coalesce(btrim(v_elem->>'nome'), ''),
      CASE WHEN lower(btrim(coalesce(v_elem->>'tipo', ''))) = 'externo' THEN 'externo' ELSE 'interno' END,
      coalesce(btrim(v_elem->>'matricula'), ''),
      coalesce(btrim(v_elem->>'funcao'), ''),
      coalesce(btrim(v_elem->>'empresa'), ''),
      coalesce(btrim(v_elem->>'documento'), ''),
      coalesce(btrim(v_elem->>'telefone'), ''),
      coalesce(btrim(v_elem->>'observacao'), ''),
      coalesce((v_elem->>'ativo')::boolean, true),
      v_new
    );
    v_wire := v_wire || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'nome', coalesce(btrim(v_elem->>'nome'), ''),
      'tipo', CASE WHEN lower(btrim(coalesce(v_elem->>'tipo', ''))) = 'externo' THEN 'externo' ELSE 'interno' END,
      'matricula', coalesce(btrim(v_elem->>'matricula'), ''),
      'funcao', coalesce(btrim(v_elem->>'funcao'), ''),
      'empresa', coalesce(btrim(v_elem->>'empresa'), ''),
      'documento', coalesce(btrim(v_elem->>'documento'), ''),
      'telefone', coalesce(btrim(v_elem->>'telefone'), ''),
      'observacao', coalesce(btrim(v_elem->>'observacao'), ''),
      'ativo', coalesce((v_elem->>'ativo')::boolean, true)
    ));
  END LOOP;

  -- Projecção leve no snapshot (APKs antigos / meta-slices).
  IF p_baseline IS NULL THEN
    INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
    VALUES (
      'default',
      p_tenant_id,
      jsonb_build_object('colaboradores', v_wire, 'dataAtualizacao', v_new),
      v_new
    )
    ON CONFLICT (id, tenant_id) DO UPDATE SET
      payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
        || jsonb_build_object('colaboradores', v_wire, 'dataAtualizacao', v_new),
      updated_at = v_new;
  ELSE
    UPDATE public.iso_pro_snapshot s
    SET
      payload = coalesce(s.payload, '{}'::jsonb)
        || jsonb_build_object('colaboradores', v_wire, 'dataAtualizacao', v_new),
      updated_at = v_new
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_replace_colaboradores(uuid, jsonb, timestamptz) IS
  'SoT tabela iso_pro_colaboradores + projecção no snapshot.';

REVOKE ALL ON FUNCTION public.iso_pro_replace_colaboradores(uuid, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_replace_colaboradores(uuid, jsonb, timestamptz)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_list_colaboradores_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 100,
  p_tipo text DEFAULT NULL,
  p_ativo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_off int;
  v_lim int;
  v_tipo text;
  v_ativo text;
  v_total int := 0;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 100), 1), 500);
  v_tipo := lower(nullif(btrim(coalesce(p_tipo, '')), ''));
  IF v_tipo IN ('todos', 'all') THEN v_tipo := NULL; END IF;
  v_ativo := lower(btrim(coalesce(p_ativo, '')));
  IF v_ativo IN ('', 'todos', 'all') THEN v_ativo := NULL; END IF;

  WITH base AS (
    SELECT c.*
    FROM public.iso_pro_colaboradores c
    WHERE c.tenant_id = p_tenant_id
      AND (v_tipo IS NULL OR c.tipo = v_tipo)
      AND (
        v_ativo IS NULL
        OR (v_ativo IN ('ativos', 'ativo', 'true', '1') AND c.ativo = true)
        OR (v_ativo IN ('inativos', 'inativo', 'false', '0') AND c.ativo = false)
      )
      AND (
        v_q = ''
        OR lower(c.nome) LIKE '%' || v_q || '%'
        OR lower(c.matricula) LIKE '%' || v_q || '%'
        OR lower(c.funcao) LIKE '%' || v_q || '%'
        OR lower(c.empresa) LIKE '%' || v_q || '%'
        OR lower(c.documento) LIKE '%' || v_q || '%'
        OR lower(c.telefone) LIKE '%' || v_q || '%'
      )
  ),
  counted AS (SELECT count(*)::int AS c FROM base),
  page AS (
    SELECT * FROM base
    ORDER BY lower(btrim(nome)), id
    OFFSET v_off LIMIT v_lim
  )
  SELECT
    (SELECT c FROM counted),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'nome', p.nome,
            'tipo', p.tipo,
            'matricula', p.matricula,
            'funcao', p.funcao,
            'empresa', p.empresa,
            'documento', p.documento,
            'telefone', p.telefone,
            'observacao', p.observacao,
            'ativo', p.ativo
          )
          ORDER BY lower(btrim(p.nome)), p.id
        )
        FROM page p
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'itens', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_colaboradores_page(uuid, text, int, int, text, text) IS
  'Listagem paginada de colaboradores (tabela SoT).';

REVOKE ALL ON FUNCTION public.iso_pro_list_colaboradores_page(uuid, text, int, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_colaboradores_page(uuid, text, int, int, text, text)
  TO anon, authenticated, service_role;

-- Meta-slices: colaboradores da tabela; config/ajustes ainda do payload.
CREATE OR REPLACE FUNCTION public.iso_pro_read_snapshot_meta_slices(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_at timestamptz;
  v_cols jsonb;
  v_n int;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT s.payload, s.updated_at INTO v_payload, v_at
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  SELECT count(*)::int INTO v_n
  FROM public.iso_pro_colaboradores c
  WHERE c.tenant_id = p_tenant_id;

  IF coalesce(v_n, 0) = 0 THEN
    -- Auto-backfill uma vez se tabela vazia e snapshot tem dados.
    PERFORM public.iso_pro_sync_colaboradores_from_snapshot(p_tenant_id);
  END IF;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'nome', c.nome,
          'tipo', c.tipo,
          'matricula', c.matricula,
          'funcao', c.funcao,
          'empresa', c.empresa,
          'documento', c.documento,
          'telefone', c.telefone,
          'observacao', c.observacao,
          'ativo', c.ativo
        )
        ORDER BY lower(btrim(c.nome)), c.id
      )
      FROM public.iso_pro_colaboradores c
      WHERE c.tenant_id = p_tenant_id
    ),
    coalesce(v_payload->'colaboradores', '[]'::jsonb)
  )
  INTO v_cols;

  RETURN jsonb_build_object(
    'colaboradores', coalesce(v_cols, '[]'::jsonb),
    'configuracoesSistema', coalesce(v_payload->'configuracoesSistema', '{}'::jsonb),
    'estoqueAjustes', coalesce(v_payload->'estoqueAjustes', '[]'::jsonb),
    '_updatedAt', v_at
  );
END;
$$;

-- Backfill imediato no tenant default (sem depender do assert JWT no push).
DO $$
DECLARE
  v_payload jsonb;
  v_elem jsonb;
BEGIN
  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default'
    AND s.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;
  IF v_payload IS NULL THEN
    RETURN;
  END IF;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(v_payload->'colaboradores', '[]'::jsonb))
  LOOP
    INSERT INTO public.iso_pro_colaboradores (
      tenant_id, id, nome, tipo, matricula, funcao, empresa, documento, telefone, observacao, ativo, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000001'::uuid,
      coalesce(nullif(btrim(v_elem->>'id'), ''), gen_random_uuid()::text),
      coalesce(btrim(v_elem->>'nome'), ''),
      CASE WHEN lower(btrim(coalesce(v_elem->>'tipo', ''))) = 'externo' THEN 'externo' ELSE 'interno' END,
      coalesce(btrim(v_elem->>'matricula'), ''),
      coalesce(btrim(v_elem->>'funcao'), ''),
      coalesce(btrim(v_elem->>'empresa'), ''),
      coalesce(btrim(v_elem->>'documento'), ''),
      coalesce(btrim(v_elem->>'telefone'), ''),
      coalesce(btrim(v_elem->>'observacao'), ''),
      coalesce((v_elem->>'ativo')::boolean, true),
      now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      nome = EXCLUDED.nome,
      tipo = EXCLUDED.tipo,
      matricula = EXCLUDED.matricula,
      funcao = EXCLUDED.funcao,
      empresa = EXCLUDED.empresa,
      documento = EXCLUDED.documento,
      telefone = EXCLUDED.telefone,
      observacao = EXCLUDED.observacao,
      ativo = EXCLUDED.ativo,
      updated_at = now();
  END LOOP;
END $$;

COMMIT;
