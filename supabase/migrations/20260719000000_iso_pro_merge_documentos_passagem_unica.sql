-- Estorno/baixa em lote MULTIPLOS: o merge de documentos re-escrevia o array inteiro
-- (4k desenhos / ~8.5MB) UMA VEZ POR DESENHO do patch. Com 2+ desenhos estourava os 90s.
-- Agora: uma unica passagem (jsonb_agg) independente do tamanho do patch, e o assert
-- destoasta documentos[] uma so vez.
BEGIN;

-- 1) Merge de documentos: passagem unica sobre o array actual.
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
  v_patch_map jsonb := '{}'::jsonb;
  v_extra jsonb := '[]'::jsonb;
  v_seen_ids jsonb := '{}'::jsonb;
  v_result jsonb := '[]'::jsonb;
  v_row jsonb;
  v_id text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RETURN COALESCE(p_patch, 'null'::jsonb);
  END IF;
  IF jsonb_array_length(p_patch) = 0 THEN
    RETURN COALESCE(p_current, '[]'::jsonb);
  END IF;

  -- Mapa do patch (pequeno: docs alterados pela baixa/estorno).
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
    v_id := btrim(COALESCE(v_row ->> 'id', ''));
    IF v_id = '' THEN
      v_extra := v_extra || jsonb_build_array(v_row);
    ELSE
      v_patch_map := v_patch_map || jsonb_build_object(v_id, v_row);
    END IF;
  END LOOP;

  IF p_current IS NOT NULL AND jsonb_typeof(p_current) = 'array' THEN
    -- UMA passagem: substitui os docs presentes no patch, preserva a ordem dos restantes.
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN btrim(COALESCE(elem.value ->> 'id', '')) <> ''
          AND v_patch_map ? btrim(COALESCE(elem.value ->> 'id', ''))
        THEN public.iso_pro_merge_documento_planejamento_atendimento(
          elem.value,
          v_patch_map -> btrim(COALESCE(elem.value ->> 'id', '')),
          p_eh_estorno
        )
        ELSE elem.value
      END
      ORDER BY elem.ord
    ), '[]'::jsonb)
    INTO v_result
    FROM jsonb_array_elements(p_current) WITH ORDINALITY AS elem(value, ord);

    SELECT COALESCE(jsonb_object_agg(btrim(COALESCE(elem.value ->> 'id', '')), true), '{}'::jsonb)
    INTO v_seen_ids
    FROM jsonb_array_elements(p_current) AS elem(value)
    WHERE btrim(COALESCE(elem.value ->> 'id', '')) <> '';
  END IF;

  v_seen_ids := COALESCE(v_seen_ids, '{}'::jsonb);

  -- Docs do patch que nao existiam no array actual: acrescenta no fim.
  FOR v_id, v_row IN SELECT * FROM jsonb_each(v_patch_map) LOOP
    IF NOT (v_seen_ids ? v_id) THEN
      v_result := v_result || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  RETURN v_result || v_extra;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_jsonb_merge_documentos_atendimento_by_id(jsonb, jsonb, boolean) IS
  'Merge documentos de atendimento por id em passagem unica (rapido mesmo com varios docs no patch).';

-- 2) Assert: destoasta documentos[] uma unica vez (evita repetir p_current->documentos por doc).
CREATE OR REPLACE FUNCTION public.iso_pro_assert_atendimento_documentos_progresso(
  p_current jsonb,
  p_documentos_patch jsonb,
  p_tem_historico_ou_lote boolean,
  p_eh_estorno boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_docs jsonb;
  v_patch_doc jsonb;
  v_current_doc jsonb;
  v_patch_item jsonb;
  v_current_item jsonb;
  v_item_id text;
  v_old_q numeric;
  v_patch_q numeric;
  v_proj_q numeric;
  v_progresso numeric := 0;
  v_regressao numeric := 0;
BEGIN
  IF p_documentos_patch IS NULL
    OR jsonb_typeof(p_documentos_patch) <> 'array'
    OR jsonb_array_length(p_documentos_patch) = 0 THEN
    RETURN;
  END IF;

  v_docs := p_current -> 'documentos';

  FOR v_patch_doc IN SELECT value FROM jsonb_array_elements(p_documentos_patch) LOOP
    v_current_doc := public.iso_pro_find_jsonb_array_element_by_id(v_docs, v_patch_doc ->> 'id');
    IF v_current_doc IS NULL THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_patch_doc -> 'itens') <> 'array' THEN
      CONTINUE;
    END IF;
    FOR v_patch_item IN SELECT value FROM jsonb_array_elements(v_patch_doc -> 'itens') LOOP
      v_item_id := btrim(COALESCE(v_patch_item ->> 'id', ''));
      v_current_item := CASE
        WHEN v_item_id <> '' THEN public.iso_pro_find_jsonb_array_element_by_id(v_current_doc -> 'itens', v_item_id)
        ELSE NULL
      END;
      IF v_current_item IS NULL THEN
        CONTINUE;
      END IF;
      v_proj_q := COALESCE(
        NULLIF(public.iso_pro_num_from_jsonb(v_current_item, ARRAY['quantidade', 'quantidadeProjeto']), 0),
        public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidade', 'quantidadeProjeto']),
        0
      );
      v_old_q := public.iso_pro_num_from_jsonb(v_current_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);
      v_patch_q := public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);

      IF v_patch_q > v_proj_q + 0.001 THEN
        RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PLANEJADO' USING ERRCODE = 'P0001';
      END IF;
      IF v_patch_q > v_old_q + 0.001 THEN
        IF (v_patch_q - v_old_q) > (v_proj_q - v_old_q) + 0.001 THEN
          RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PENDENTE' USING ERRCODE = 'P0001';
        END IF;
        v_progresso := v_progresso + (v_patch_q - v_old_q);
      ELSIF v_old_q > v_patch_q + 0.001 THEN
        v_regressao := v_regressao + (v_old_q - v_patch_q);
      END IF;
    END LOOP;
  END LOOP;

  IF p_eh_estorno THEN
    IF v_regressao < 0.001 THEN
      RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_SEM_PROGRESSO'
        USING ERRCODE = 'P0001',
          DETAIL = 'Estorno sem diminuicao de quantidadeAtendida no planejamento.';
    END IF;
    RETURN;
  END IF;

  IF p_tem_historico_ou_lote AND v_progresso < 0.001 THEN
    RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_SEM_PROGRESSO'
      USING ERRCODE = 'P0001',
        DETAIL = 'Recibo/lote sem incremento de quantidadeAtendida no planejamento (possivel baixa duplicada).';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_assert_atendimento_documentos_progresso(jsonb, jsonb, boolean, boolean) IS
  'Valida progresso (+) em baixas ou regressao (-) em estornos; documentos[] destoastado uma vez.';

COMMIT;
