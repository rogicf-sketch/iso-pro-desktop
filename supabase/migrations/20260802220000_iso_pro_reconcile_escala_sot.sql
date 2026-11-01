-- Reconciliador snapshot ↔ tabelas de escala (guarda SoT antes do flip table-first).
-- Compara IDs; com p_heal=true re-sincroniza dominios com faltas na tabela (snapshot → tabelas).

CREATE OR REPLACE FUNCTION public.iso_pro_reconcile_escala_sot(
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
  v_domains jsonb := '{}'::jsonb;
  v_diverged text[] := ARRAY[]::text[];
  v_domain text;
  v_snap_ids text[];
  v_table_ids text[];
  v_missing_table text[];
  v_missing_snap text[];
  v_aligned boolean;
  v_healed boolean;
  v_sync jsonb;
  v_arr jsonb;
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
      'domains', '{}'::jsonb,
      'diverged', '[]'::jsonb
    );
  END IF;

  FOREACH v_domain IN ARRAY ARRAY['documentos', 'recebimentos', 'inventarios', 'rir', 'rnc']
  LOOP
    v_healed := false;

    IF v_domain = 'documentos' THEN
      v_arr := coalesce(v_payload -> 'documentos', '[]'::jsonb);
      SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
      INTO v_snap_ids
      FROM (
        SELECT btrim(elem->>'id') AS id
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END) elem
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
      ) x;

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_documentos_planejamento t
      WHERE t.tenant_id = p_tenant_id;

    ELSIF v_domain = 'recebimentos' THEN
      v_arr := coalesce(v_payload -> 'recebimentos', '[]'::jsonb);
      SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
      INTO v_snap_ids
      FROM (
        SELECT btrim(elem->>'id') AS id
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END) elem
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
      ) x;

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_recebimentos t
      WHERE t.tenant_id = p_tenant_id;

    ELSIF v_domain = 'inventarios' THEN
      v_arr := coalesce(v_payload -> 'inventarios', '[]'::jsonb);
      SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
      INTO v_snap_ids
      FROM (
        SELECT btrim(elem->>'id') AS id
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END) elem
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
      ) x;

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_inventarios t
      WHERE t.tenant_id = p_tenant_id;

    ELSIF v_domain = 'rir' THEN
      v_arr := coalesce(v_payload -> 'rirRegistros', v_payload -> 'rir', '[]'::jsonb);
      SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
      INTO v_snap_ids
      FROM (
        SELECT btrim(elem->>'id') AS id
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END) elem
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
      ) x;

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_rir t
      WHERE t.tenant_id = p_tenant_id;

    ELSE
      v_arr := coalesce(v_payload -> 'rncRegistros', v_payload -> 'rnc', '[]'::jsonb);
      SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
      INTO v_snap_ids
      FROM (
        SELECT btrim(elem->>'id') AS id
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END) elem
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
      ) x;

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_rnc t
      WHERE t.tenant_id = p_tenant_id;
    END IF;

    SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::text[])
    INTO v_missing_table
    FROM unnest(v_snap_ids) s
    WHERE NOT (s = ANY (v_table_ids));

    SELECT coalesce(array_agg(t ORDER BY t), ARRAY[]::text[])
    INTO v_missing_snap
    FROM unnest(v_table_ids) t
    WHERE NOT (t = ANY (v_snap_ids));

    -- Critico para SoT actual (snapshot-first): IDs no snapshot ausentes na tabela.
    -- Orfaos so na tabela sao aviso (nao bloqueiam ok) — podem ser residual pos-delete.
    v_aligned := coalesce(cardinality(v_missing_table), 0) = 0;

    IF NOT v_aligned AND p_heal THEN
      IF v_domain = 'documentos' THEN
        v_sync := public.iso_pro_sync_documentos_planejamento_from_snapshot(p_tenant_id);
      ELSIF v_domain = 'recebimentos' THEN
        v_sync := public.iso_pro_sync_recebimentos_from_snapshot(p_tenant_id);
      ELSIF v_domain = 'inventarios' THEN
        v_sync := public.iso_pro_sync_inventarios_from_snapshot(p_tenant_id);
      ELSIF v_domain = 'rir' THEN
        v_sync := public.iso_pro_sync_rir_from_snapshot(p_tenant_id);
      ELSE
        v_sync := public.iso_pro_sync_rnc_from_snapshot(p_tenant_id);
      END IF;
      v_healed := coalesce((v_sync ->> 'ok')::boolean, false);

      IF v_healed THEN
        -- Reconta faltas apos heal
        IF v_domain = 'documentos' THEN
          SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
          INTO v_table_ids
          FROM public.iso_pro_documentos_planejamento t
          WHERE t.tenant_id = p_tenant_id;
        ELSIF v_domain = 'recebimentos' THEN
          SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
          INTO v_table_ids
          FROM public.iso_pro_recebimentos t
          WHERE t.tenant_id = p_tenant_id;
        ELSIF v_domain = 'inventarios' THEN
          SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
          INTO v_table_ids
          FROM public.iso_pro_inventarios t
          WHERE t.tenant_id = p_tenant_id;
        ELSIF v_domain = 'rir' THEN
          SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
          INTO v_table_ids
          FROM public.iso_pro_rir t
          WHERE t.tenant_id = p_tenant_id;
        ELSE
          SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
          INTO v_table_ids
          FROM public.iso_pro_rnc t
          WHERE t.tenant_id = p_tenant_id;
        END IF;

        SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::text[])
        INTO v_missing_table
        FROM unnest(v_snap_ids) s
        WHERE NOT (s = ANY (v_table_ids));

        v_aligned := coalesce(cardinality(v_missing_table), 0) = 0;
      END IF;
    END IF;

    IF NOT v_aligned THEN
      v_diverged := array_append(v_diverged, v_domain);
    END IF;

    v_domains := v_domains || jsonb_build_object(
      v_domain,
      jsonb_build_object(
        'snapshotCount', coalesce(cardinality(v_snap_ids), 0),
        'tableCount', coalesce(cardinality(v_table_ids), 0),
        'missingInTableCount', coalesce(cardinality(v_missing_table), 0),
        'missingInSnapshotCount', coalesce(cardinality(v_missing_snap), 0),
        'missingInTable', to_jsonb(v_missing_table[1:20]),
        'missingInSnapshot', to_jsonb(v_missing_snap[1:20]),
        'aligned', v_aligned,
        'healed', v_healed
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', coalesce(cardinality(v_diverged), 0) = 0,
    'domains', v_domains,
    'diverged', to_jsonb(v_diverged),
    'healed', p_heal
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_reconcile_escala_sot(uuid, boolean) IS
  'Compara IDs snapshot vs tabelas de escala; p_heal re-sincroniza faltas na tabela.';

REVOKE ALL ON FUNCTION public.iso_pro_reconcile_escala_sot(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reconcile_escala_sot(uuid, boolean) TO anon, authenticated, service_role;
