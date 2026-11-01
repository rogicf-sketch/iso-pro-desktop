-- Apos gravar recebimentos, o cache iso_pro_qty_recebida_por_codigo ficava
-- desatualizado: a RPC sum_* lia o cache antigo e o Atendimento mostrava
-- «Saldo: 0 / Sem saldo» mesmo com NF recebida e desenho «Recebido».
-- Refresh do agregado no fim da write SoT.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_write_recebimentos_sot(
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
SET statement_timeout = '180s'
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
      RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_recebimento_itens WHERE tenant_id = p_tenant_id;
    DELETE FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (replace).')
        USING ERRCODE = 'P0001';
    END IF;
    v_arr := p_replace_all;

  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_recebimentos(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar recebimentos.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (upsert).')
          USING ERRCODE = 'P0001';
      END IF;

      SELECT coalesce(array_agg(DISTINCT btrim(elem->>'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_upsert) elem
      WHERE btrim(coalesce(elem->>'id', '')) <> '';
    END IF;

    SELECT s.payload
    INTO v_payload
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

    v_arr := coalesce(v_payload -> 'recebimentos', '[]'::jsonb);
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_arr := '[]'::jsonb;
    END IF;

    IF coalesce(cardinality(p_remove_ids), 0) = 0
       AND coalesce(cardinality(v_ids), 0) > 0
       AND jsonb_typeof(v_upsert) = 'array'
       AND jsonb_array_length(v_upsert) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_arr) elem
         WHERE btrim(coalesce(elem->>'id', '')) = ANY (v_ids)
       )
    THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    ELSE
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
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
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

  -- Mantem o saldo do Atendimento alinhado com as NFs gravadas.
  BEGIN
    PERFORM public.iso_pro_refresh_qty_recebida_por_codigo(p_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'iso_pro_refresh_qty_recebida_por_codigo falhou: %', SQLERRM;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) IS
  'SoT recebimentos: tabelas + snapshot + refresh qty_recebida. Sem recalc status inline.';

REVOKE ALL ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb)
  TO authenticated, service_role;

-- Corrige o cache ja desatualizado em LIVE.
SELECT public.iso_pro_refresh_qty_recebida_por_codigo('00000000-0000-0000-0000-000000000001') AS refresh_now;

COMMIT;
