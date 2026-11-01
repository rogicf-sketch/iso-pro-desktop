-- Importacao CSV de materiais: cada lote de 2000 reescrevia o snapshot inteiro
-- (jsonb de dezenas de milhares de itens). A tabela gravava e o navegador
-- ficava em «Aguarde» sem receber o fim. Lote grande grava so a tabela.
-- A projecao do snapshot fica para uma chamada unica no fim.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_write_materiais_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_delete_ids jsonb DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_id bigint;
  v_updated int := 0;
  v_old_materiais jsonb := '[]'::jsonb;
  v_saldo_map jsonb := '{}'::jsonb;
  v_proj jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_MATERIAIS_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.materiais WHERE tenant_id = p_tenant_id;
    v_arr := p_replace_all;
  ELSIF p_upsert IS NOT NULL THEN
    IF jsonb_typeof(p_upsert) = 'array' THEN
      v_arr := p_upsert;
    ELSIF jsonb_typeof(p_upsert) = 'object' THEN
      v_arr := jsonb_build_array(p_upsert);
    ELSE
      RAISE EXCEPTION 'ISO_PRO_MATERIAIS_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_arr := '[]'::jsonb;
  END IF;

  IF p_delete_ids IS NOT NULL AND jsonb_typeof(p_delete_ids) = 'array' THEN
    DELETE FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id
      AND m.id IN (
        SELECT NULLIF(btrim(x), '')::bigint
        FROM jsonb_array_elements_text(p_delete_ids) AS t(x)
        WHERE NULLIF(btrim(x), '') ~ '^[0-9]+$'
      );
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_arr)
  LOOP
    BEGIN
      v_id := NULLIF(btrim(coalesce(v_elem->>'id', '')), '')::bigint;
    EXCEPTION WHEN OTHERS THEN
      v_id := NULL;
    END;
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.materiais (
      tenant_id, id, codigo, codigo_barras, descricao, diametro, disciplina, unidade,
      peso, estoque_minimo, ativo, updated_at
    ) VALUES (
      p_tenant_id,
      v_id,
      coalesce(btrim(v_elem->>'codigo'), btrim(v_elem->>'Codigo'), ''),
      coalesce(btrim(v_elem->>'codigoBarras'), btrim(v_elem->>'codigo_barras'), ''),
      coalesce(btrim(v_elem->>'descricao'), ''),
      coalesce(btrim(v_elem->>'diametro'), ''),
      coalesce(btrim(v_elem->>'disciplina'), ''),
      coalesce(btrim(v_elem->>'unidade'), ''),
      coalesce((v_elem->>'peso')::double precision, 0),
      coalesce(
        (v_elem->>'estoqueMinimo')::double precision,
        (v_elem->>'estoque_minimo')::double precision,
        0
      ),
      coalesce((v_elem->>'ativo')::boolean, true),
      v_new
    )
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      codigo = EXCLUDED.codigo,
      codigo_barras = EXCLUDED.codigo_barras,
      descricao = EXCLUDED.descricao,
      diametro = EXCLUDED.diametro,
      disciplina = EXCLUDED.disciplina,
      unidade = EXCLUDED.unidade,
      peso = EXCLUDED.peso,
      estoque_minimo = EXCLUDED.estoque_minimo,
      ativo = EXCLUDED.ativo,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  IF p_replace_all IS NULL AND jsonb_array_length(v_arr) > 80 THEN
    RETURN v_new;
  END IF;

  SELECT coalesce(s.payload->'materiais', '[]'::jsonb)
  INTO v_old_materiais
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  SELECT coalesce(
    (
      SELECT jsonb_object_agg(k, v)
      FROM (
        SELECT
          btrim(coalesce(elem->>'id', '')) AS k,
          coalesce((elem->>'saldoAtual')::numeric, 0) AS v
        FROM jsonb_array_elements(coalesce(v_old_materiais, '[]'::jsonb)) elem
        WHERE NULLIF(btrim(coalesce(elem->>'id', '')), '') IS NOT NULL
      ) t
    ),
    '{}'::jsonb
  )
  INTO v_saldo_map;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id::text,
          'codigo', coalesce(m.codigo, ''),
          'codigoBarras', coalesce(m.codigo_barras, ''),
          'descricao', coalesce(m.descricao, ''),
          'diametro', coalesce(m.diametro, ''),
          'disciplina', coalesce(m.disciplina, ''),
          'unidade', coalesce(m.unidade, ''),
          'peso', coalesce(m.peso, 0),
          'estoqueMinimo', coalesce(m.estoque_minimo, 0),
          'saldoAtual', coalesce((v_saldo_map->>m.id::text)::numeric, 0),
          'ativo', coalesce(m.ativo, true),
          'observacao', ''
        )
        ORDER BY m.codigo ASC
      )
      FROM public.materiais m
      WHERE m.tenant_id = p_tenant_id
    ),
    '[]'::jsonb
  )
  INTO v_proj;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('materiais', v_proj, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('materiais', v_proj, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('materiais', v_proj, 'dataAtualizacao', v_new),
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

CREATE OR REPLACE FUNCTION public.iso_pro_project_materiais_snapshot(p_tenant_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  RETURN public.iso_pro_write_materiais_sot(p_tenant_id, NULL, '[]'::jsonb, NULL, NULL);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_project_materiais_snapshot(uuid) IS
  'Projeta public.materiais no snapshot uma vez, depois da importacao em lote.';

REVOKE ALL ON FUNCTION public.iso_pro_project_materiais_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_project_materiais_snapshot(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
