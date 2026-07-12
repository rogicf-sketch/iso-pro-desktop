-- Atendimento em snapshot grande: evita "canceling statement due to statement timeout" no mobile.
-- Aumenta limite só nas RPCs de escrita/leitura pesada; optimiza merge de 1 documento (caso comum na baixa).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_jsonb_upsert_one_in_array_by_id(
  p_current jsonb,
  p_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_id text;
  v_found boolean := false;
BEGIN
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RETURN COALESCE(p_current, '[]'::jsonb);
  END IF;

  v_id := trim(both from COALESCE(p_row->>'id', ''));
  IF v_id = '' THEN
    RETURN COALESCE(p_current, '[]'::jsonb) || jsonb_build_array(p_row);
  END IF;

  IF p_current IS NOT NULL AND jsonb_typeof(p_current) = 'array' THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_current) LOOP
      IF trim(both from COALESCE(v_elem->>'id', '')) = v_id THEN
        v_result := v_result || jsonb_build_array(p_row);
        v_found := true;
      ELSE
        v_result := v_result || jsonb_build_array(v_elem);
      END IF;
    END LOOP;
  END IF;

  IF NOT v_found THEN
    v_result := v_result || jsonb_build_array(p_row);
  END IF;

  RETURN v_result;
END;
$$;

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

  IF jsonb_array_length(p_patch) = 1 THEN
    RETURN public.iso_pro_jsonb_upsert_one_in_array_by_id(p_current, p_patch->0);
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

ALTER FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) SET statement_timeout = '90s';

ALTER FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) SET statement_timeout = '90s';

ALTER FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb, text[])
  SET statement_timeout = '90s';

ALTER FUNCTION public.iso_pro_reservar_numero_atendimento(uuid, timestamptz)
  SET statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.iso_pro_read_snapshot_slices(uuid,text[])') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER FUNCTION public.iso_pro_read_snapshot_slices(uuid, text[])
      SET statement_timeout = '60s'
    $sql$;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_jsonb_upsert_one_in_array_by_id(jsonb, jsonb) IS
  'Merge O(n) de um único elemento por id — atendimento mobile (1 desenho alterado por baixa).';

COMMIT;
