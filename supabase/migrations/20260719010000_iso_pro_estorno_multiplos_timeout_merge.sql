-- Estorno MULTIPLOS: merge so altera indices do patch (sem jsonb_agg do array inteiro)
-- e o comando de atendimento passa a ter 180s de statement_timeout.
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_jsonb_merge_documentos_atendimento_by_id(
  p_current jsonb,
  p_patch jsonb,
  p_eh_estorno boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_row jsonb;
  v_id text;
  v_idx int;
  v_current_doc jsonb;
  v_merged_doc jsonb;
  v_id_to_idx jsonb := '{}'::jsonb;
  v_seen jsonb := '{}'::jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RETURN COALESCE(p_patch, 'null'::jsonb);
  END IF;
  IF jsonb_array_length(p_patch) = 0 THEN
    RETURN COALESCE(p_current, '[]'::jsonb);
  END IF;

  IF p_current IS NULL OR jsonb_typeof(p_current) <> 'array' THEN
    RETURN p_patch;
  END IF;

  v_result := p_current;

  -- Mapa id -> indice (0-based) numa unica passagem.
  SELECT COALESCE(
    jsonb_object_agg(btrim(COALESCE(elem.value ->> 'id', '')), (elem.ord - 1)::text),
    '{}'::jsonb
  )
  INTO v_id_to_idx
  FROM jsonb_array_elements(v_result) WITH ORDINALITY AS elem(value, ord)
  WHERE btrim(COALESCE(elem.value ->> 'id', '')) <> '';

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
    v_id := btrim(COALESCE(v_row ->> 'id', ''));
    IF v_id = '' THEN
      v_result := v_result || jsonb_build_array(v_row);
      CONTINUE;
    END IF;

    IF v_id_to_idx ? v_id THEN
      v_idx := (v_id_to_idx ->> v_id)::int;
      v_current_doc := v_result -> v_idx;
      v_merged_doc := public.iso_pro_merge_documento_planejamento_atendimento(
        v_current_doc,
        v_row,
        p_eh_estorno
      );
      v_result := jsonb_set(v_result, ARRAY[v_idx::text], v_merged_doc, false);
      v_seen := v_seen || jsonb_build_object(v_id, true);
    ELSE
      v_result := v_result || jsonb_build_array(v_row);
      v_seen := v_seen || jsonb_build_object(v_id, true);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_jsonb_merge_documentos_atendimento_by_id(jsonb, jsonb, boolean) IS
  'Merge documentos por id via jsonb_set nos indices do patch (rapido para estorno MULTIPLOS).';

-- Timeout do comando: 180s (estornos MULTIPLOS com snapshot grande).
ALTER FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) SET statement_timeout = '180s';

ALTER FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) SET statement_timeout = '180s';

COMMIT;
