-- Reconciliador snapshot.atendimentos ↔ iso_pro_atendimento_lotes.
-- Com p_heal=true reinsere faltas na tabela via iso_pro_upsert_atendimento_lotes_from_json.

CREATE OR REPLACE FUNCTION public.iso_pro_reconcile_atendimento_historico(
  p_tenant_id uuid,
  p_heal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_arr jsonb;
  v_snap_ids text[];
  v_table_ids text[];
  v_missing_table text[];
  v_missing_snap text[];
  v_aligned boolean;
  v_healed boolean := false;
  v_heal_arr jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.', 'ok', false);
  END IF;

  SELECT s.payload
  INTO v_payload
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'emptySnapshot', true,
      'snapshotCount', 0,
      'tableCount', 0,
      'missingInTableCount', 0,
      'missingInSnapshotCount', 0,
      'missingInTable', '[]'::jsonb,
      'missingInSnapshot', '[]'::jsonb,
      'aligned', true,
      'healed', false,
      'diverged', false
    );
  END IF;

  v_arr := coalesce(v_payload -> 'atendimentos', '[]'::jsonb);

  SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
  INTO v_snap_ids
  FROM (
    SELECT btrim(elem->>'id') AS id
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END
    ) elem
    WHERE btrim(coalesce(elem->>'id', '')) <> ''
  ) x;

  SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
  INTO v_table_ids
  FROM public.iso_pro_atendimento_lotes t
  WHERE t.tenant_id = p_tenant_id;

  SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::text[])
  INTO v_missing_table
  FROM unnest(v_snap_ids) s
  WHERE NOT (s = ANY (v_table_ids));

  SELECT coalesce(array_agg(t ORDER BY t), ARRAY[]::text[])
  INTO v_missing_snap
  FROM unnest(v_table_ids) t
  WHERE NOT (t = ANY (v_snap_ids));

  -- Critico: IDs no snapshot ausentes na tabela SoT.
  v_aligned := coalesce(cardinality(v_missing_table), 0) = 0;

  IF NOT v_aligned AND p_heal THEN
    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    INTO v_heal_arr
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END
    ) elem
    WHERE btrim(coalesce(elem->>'id', '')) = ANY (v_missing_table);

    IF jsonb_typeof(v_heal_arr) = 'array' AND jsonb_array_length(v_heal_arr) > 0 THEN
      PERFORM public.iso_pro_upsert_atendimento_lotes_from_json(p_tenant_id, v_heal_arr);
      v_healed := true;

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_atendimento_lotes t
      WHERE t.tenant_id = p_tenant_id;

      SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::text[])
      INTO v_missing_table
      FROM unnest(v_snap_ids) s
      WHERE NOT (s = ANY (v_table_ids));

      v_aligned := coalesce(cardinality(v_missing_table), 0) = 0;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', v_aligned,
    'emptySnapshot', false,
    'snapshotCount', coalesce(cardinality(v_snap_ids), 0),
    'tableCount', coalesce(cardinality(v_table_ids), 0),
    'missingInTableCount', coalesce(cardinality(v_missing_table), 0),
    'missingInSnapshotCount', coalesce(cardinality(v_missing_snap), 0),
    'missingInTable', to_jsonb(v_missing_table[1:20]),
    'missingInSnapshot', to_jsonb(v_missing_snap[1:20]),
    'aligned', v_aligned,
    'healed', v_healed,
    'diverged', NOT v_aligned
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean) IS
  'Compara IDs snapshot.atendimentos vs iso_pro_atendimento_lotes; p_heal reinsere faltas.';

REVOKE ALL ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean)
  TO anon, authenticated, service_role;
