-- Merge de documentos no atendimento: o caminho antigo fazia
--   v_map := v_map || jsonb_build_object(id, doc)
-- para ~4000 desenhos. Em JSONB isso e O(n^2) e o estorno/baixa
-- ultrapassava 45s. Para patches pequenos (<= 64 docs) substitui
-- so os indices afectadosados via jsonb_set.
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
  v_patch_len int;
  v_map jsonb := '{}'::jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RETURN COALESCE(p_patch, 'null'::jsonb);
  END IF;

  v_patch_len := jsonb_array_length(p_patch);
  IF v_patch_len = 0 THEN
    RETURN COALESCE(p_current, '[]'::jsonb);
  END IF;

  -- Caminho rapido: 1..64 docs (baixa tipica / estorno / sessao pequena).
  IF v_patch_len <= 64 AND p_current IS NOT NULL AND jsonb_typeof(p_current) = 'array' THEN
    v_result := p_current;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
      v_id := btrim(COALESCE(v_row ->> 'id', ''));
      IF v_id = '' THEN
        v_result := v_result || jsonb_build_array(v_row);
        CONTINUE;
      END IF;

      SELECT (ord - 1)::int, elem.value
      INTO v_idx, v_current_doc
      FROM jsonb_array_elements(v_result) WITH ORDINALITY AS elem(value, ord)
      WHERE btrim(COALESCE(elem.value ->> 'id', '')) = v_id
      LIMIT 1;

      IF v_idx IS NULL THEN
        v_result := v_result || jsonb_build_array(v_row);
      ELSE
        v_merged_doc := public.iso_pro_merge_documento_planejamento_atendimento(
          v_current_doc,
          v_row,
          p_eh_estorno
        );
        v_result := jsonb_set(v_result, ARRAY[v_idx::text], v_merged_doc, false);
      END IF;
    END LOOP;
    RETURN v_result;
  END IF;

  -- Caminho legado (patches grandes): mantem semantica anterior.
  IF p_current IS NOT NULL AND jsonb_typeof(p_current) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_current) LOOP
      v_id := btrim(COALESCE(v_row ->> 'id', ''));
      IF v_id <> '' THEN
        v_map := v_map || jsonb_build_object(v_id, v_row);
      ELSE
        v_out := v_out || jsonb_build_array(v_row);
      END IF;
    END LOOP;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
    v_id := btrim(COALESCE(v_row ->> 'id', ''));
    IF v_id <> '' THEN
      v_current_doc := COALESCE(v_map -> v_id, 'null'::jsonb);
      IF v_current_doc IS NULL OR v_current_doc = 'null'::jsonb THEN
        v_merged_doc := v_row;
      ELSE
        v_merged_doc := public.iso_pro_merge_documento_planejamento_atendimento(
          v_current_doc,
          v_row,
          p_eh_estorno
        );
      END IF;
      v_map := v_map || jsonb_build_object(v_id, v_merged_doc);
    ELSE
      v_out := v_out || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  FOR v_id, v_row IN SELECT * FROM jsonb_each(v_map) LOOP
    v_out := v_out || jsonb_build_array(v_row);
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_jsonb_merge_documentos_atendimento_by_id(jsonb, jsonb, boolean) IS
  'Merge documentos de atendimento por id; patches <=64 usam jsonb_set (rapido).';

COMMIT;
