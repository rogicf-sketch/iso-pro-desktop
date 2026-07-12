-- Merge por id em arrays do snapshot (patch delta — app Campo / atendimento em dados móveis).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_jsonb_merge_array_by_id(
  p_current jsonb,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_row jsonb;
  v_id text;
  v_map jsonb := '{}'::jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RETURN COALESCE(p_patch, 'null'::jsonb);
  END IF;

  IF p_current IS NOT NULL AND jsonb_typeof(p_current) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_current) LOOP
      v_id := trim(both from COALESCE(v_row->>'id', ''));
      IF v_id <> '' THEN
        v_map := v_map || jsonb_build_object(v_id, v_row);
      ELSE
        v_result := v_result || jsonb_build_array(v_row);
      END IF;
    END LOOP;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
    v_id := trim(both from COALESCE(v_row->>'id', ''));
    IF v_id <> '' THEN
      v_map := v_map || jsonb_build_object(v_id, v_row);
    ELSE
      v_result := v_result || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  FOR v_id, v_row IN SELECT * FROM jsonb_each(v_map) LOOP
    v_result := v_result || jsonb_build_array(v_row);
  END LOOP;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.iso_pro_patch_snapshot(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb,
  p_merge_keys text[] DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_rows integer;
  v_current jsonb;
  v_merged jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_baseline IS NULL THEN
    INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
    VALUES ('default', p_tenant_id, p_patch, v_new)
    ON CONFLICT (id, tenant_id) DO UPDATE
    SET
      payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb) || EXCLUDED.payload,
      updated_at = v_new;
    RETURN v_new;
  END IF;

  SELECT payload INTO v_current
  FROM public.iso_pro_snapshot
  WHERE id = 'default'
    AND tenant_id = p_tenant_id
    AND updated_at = p_baseline
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_merged := coalesce(v_current, '{}'::jsonb);

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch) LOOP
    IF p_merge_keys IS NOT NULL
      AND v_key = ANY(p_merge_keys)
      AND jsonb_typeof(v_value) = 'array' THEN
      v_merged := jsonb_set(
        v_merged,
        ARRAY[v_key],
        public.iso_pro_jsonb_merge_array_by_id(v_merged->v_key, v_value),
        true
      );
    ELSE
      v_merged := v_merged || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;

  UPDATE public.iso_pro_snapshot
  SET payload = v_merged,
      updated_at = v_new
  WHERE id = 'default'
    AND tenant_id = p_tenant_id
    AND updated_at = p_baseline;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb, text[]) IS
  'Merge atomico no payload com lock optimista; p_merge_keys funde arrays por id em vez de substituir.';

REVOKE ALL ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb, text[]) TO anon, authenticated;

COMMIT;
