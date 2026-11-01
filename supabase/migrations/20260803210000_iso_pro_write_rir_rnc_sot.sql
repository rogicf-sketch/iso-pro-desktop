-- RIR / RNC table-first (SoT): tabelas primeiro + projecao snapshot sem outbox.

CREATE OR REPLACE FUNCTION public.iso_pro_write_rir_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_payload jsonb;
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_sync jsonb;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RIR_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_rir WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_rir_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RIR (replace).')
        USING ERRCODE = 'P0001';
    END IF;
    v_arr := p_replace_all;
  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_rir(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar RIR.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RIR_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_rir_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RIR (upsert).')
          USING ERRCODE = 'P0001';
      END IF;
      SELECT coalesce(array_agg(DISTINCT btrim(elem->>'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_upsert) elem
      WHERE btrim(coalesce(elem->>'id', '')) <> '';
    END IF;

    SELECT s.payload INTO v_payload
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

    v_arr := coalesce(v_payload -> 'rirRegistros', '[]'::jsonb);
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_arr := '[]'::jsonb;
    END IF;

    IF coalesce(cardinality(p_remove_ids), 0) > 0 OR coalesce(cardinality(v_ids), 0) > 0 THEN
      SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      INTO v_arr
      FROM (
        SELECT elem, ord
        FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(elem, ord)
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
          AND NOT (
            coalesce(cardinality(p_remove_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (p_remove_ids)
          )
          AND NOT (
            coalesce(cardinality(v_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (v_ids)
          )
      ) x;
    END IF;

    IF jsonb_typeof(v_upsert) = 'array' AND jsonb_array_length(v_upsert) > 0 THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    END IF;
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default', p_tenant_id,
        jsonb_build_object('rirRegistros', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('rirRegistros', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('rirRegistros', v_arr, 'dataAtualizacao', v_new),
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

CREATE OR REPLACE FUNCTION public.iso_pro_write_rnc_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_payload jsonb;
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_sync jsonb;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RNC_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_rnc WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_rnc_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RNC (replace).')
        USING ERRCODE = 'P0001';
    END IF;
    v_arr := p_replace_all;
  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_rnc(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar RNC.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RNC_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_rnc_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RNC (upsert).')
          USING ERRCODE = 'P0001';
      END IF;
      SELECT coalesce(array_agg(DISTINCT btrim(elem->>'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_upsert) elem
      WHERE btrim(coalesce(elem->>'id', '')) <> '';
    END IF;

    SELECT s.payload INTO v_payload
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

    v_arr := coalesce(v_payload -> 'rncRegistros', '[]'::jsonb);
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_arr := '[]'::jsonb;
    END IF;

    IF coalesce(cardinality(p_remove_ids), 0) > 0 OR coalesce(cardinality(v_ids), 0) > 0 THEN
      SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      INTO v_arr
      FROM (
        SELECT elem, ord
        FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(elem, ord)
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
          AND NOT (
            coalesce(cardinality(p_remove_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (p_remove_ids)
          )
          AND NOT (
            coalesce(cardinality(v_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (v_ids)
          )
      ) x;
    END IF;

    IF jsonb_typeof(v_upsert) = 'array' AND jsonb_array_length(v_upsert) > 0 THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    END IF;
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default', p_tenant_id,
        jsonb_build_object('rncRegistros', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('rncRegistros', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('rncRegistros', v_arr, 'dataAtualizacao', v_new),
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

CREATE OR REPLACE FUNCTION public.iso_pro_delete_rnc(p_tenant_id uuid, p_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.'); END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN jsonb_build_object('ok', true, 'deleted', 0); END IF;
  DELETE FROM public.iso_pro_rnc WHERE tenant_id = p_tenant_id AND id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_delete_rnc(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_delete_rnc(uuid, text[]) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb) IS
  'SoT RIR: tabelas primeiro + projecao snapshot (sem outbox escala).';
COMMENT ON FUNCTION public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb) IS
  'SoT RNC: tabelas primeiro + projecao snapshot (sem outbox escala).';

REVOKE ALL ON FUNCTION public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb)
  TO anon, authenticated, service_role;
