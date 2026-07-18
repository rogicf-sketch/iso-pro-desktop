-- Estorno PC/web: a validacao SEM_PROGRESSO e o merge GREATEST bloqueavam diminuicoes
-- de quantidadeAtendida. Com log de estorno, a regressao e permitida e aplicada.
BEGIN;

-- 1) Assert: baixa exige progresso (+); estorno exige regressao (-)
DROP FUNCTION IF EXISTS public.iso_pro_assert_atendimento_documentos_progresso(jsonb, jsonb, boolean);

CREATE FUNCTION public.iso_pro_assert_atendimento_documentos_progresso(
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

  FOR v_patch_doc IN SELECT value FROM jsonb_array_elements(p_documentos_patch) LOOP
    v_current_doc := public.iso_pro_find_jsonb_array_element_by_id(p_current -> 'documentos', v_patch_doc ->> 'id');
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
    -- Estorno: tem de haver diminuicao real no planejamento.
    IF v_regressao < 0.001 THEN
      RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_SEM_PROGRESSO'
        USING ERRCODE = 'P0001',
          DETAIL = 'Estorno sem diminuicao de quantidadeAtendida no planejamento.';
    END IF;
    RETURN;
  END IF;

  -- Baixa / recibo: exige incremento (anti-duplicata).
  IF p_tem_historico_ou_lote AND v_progresso < 0.001 THEN
    RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_SEM_PROGRESSO'
      USING ERRCODE = 'P0001',
        DETAIL = 'Recibo/lote sem incremento de quantidadeAtendida no planejamento (possivel baixa duplicada).';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_assert_atendimento_documentos_progresso(jsonb, jsonb, boolean, boolean) IS
  'Valida progresso (+) em baixas ou regressao (-) em estornos no patch de documentos.';

-- 2) Merge por item: com estorno, aplica a quantidade do patch (permite diminuir)
DROP FUNCTION IF EXISTS public.iso_pro_merge_documento_planejamento_atendimento(jsonb, jsonb);

CREATE FUNCTION public.iso_pro_merge_documento_planejamento_atendimento(
  p_current_doc jsonb,
  p_patch_doc jsonb,
  p_eh_estorno boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_patch_item jsonb;
  v_current_item jsonb;
  v_item_id text;
  v_old_q numeric;
  v_patch_q numeric;
  v_proj_q numeric;
  v_merged_q numeric;
  v_seen jsonb := '{}'::jsonb;
BEGIN
  IF p_patch_doc IS NULL OR jsonb_typeof(p_patch_doc) <> 'object' THEN
    RETURN COALESCE(p_current_doc, p_patch_doc);
  END IF;
  IF p_current_doc IS NULL OR jsonb_typeof(p_current_doc) <> 'object' THEN
    RETURN p_patch_doc;
  END IF;

  v_result := p_current_doc || (p_patch_doc - 'itens');

  IF jsonb_typeof(p_patch_doc -> 'itens') = 'array' THEN
    FOR v_patch_item IN SELECT value FROM jsonb_array_elements(p_patch_doc -> 'itens') LOOP
      v_item_id := btrim(COALESCE(v_patch_item ->> 'id', ''));
      v_current_item := CASE
        WHEN v_item_id <> '' THEN public.iso_pro_find_jsonb_array_element_by_id(p_current_doc -> 'itens', v_item_id)
        ELSE NULL
      END;

      v_proj_q := COALESCE(
        NULLIF(public.iso_pro_num_from_jsonb(v_current_item, ARRAY['quantidade', 'quantidadeProjeto']), 0),
        public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidade', 'quantidadeProjeto']),
        0
      );
      v_old_q := public.iso_pro_num_from_jsonb(v_current_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);
      v_patch_q := public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);

      IF v_patch_q > v_proj_q + 0.001 THEN
        RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PLANEJADO'
          USING ERRCODE = 'P0001',
            DETAIL = format(
              'documento=%s item=%s atendido=%s projeto=%s',
              COALESCE(p_patch_doc ->> 'numero', '?'),
              COALESCE(v_patch_item ->> 'codigo', v_item_id),
              v_patch_q,
              v_proj_q
            );
      END IF;

      IF NOT p_eh_estorno
        AND v_patch_q > v_old_q + 0.001
        AND (v_patch_q - v_old_q) > (v_proj_q - v_old_q) + 0.001 THEN
        RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PENDENTE'
          USING ERRCODE = 'P0001',
            DETAIL = format(
              'documento=%s item=%s incremento=%s pendente=%s',
              COALESCE(p_patch_doc ->> 'numero', '?'),
              COALESCE(v_patch_item ->> 'codigo', v_item_id),
              v_patch_q - v_old_q,
              v_proj_q - v_old_q
            );
      END IF;

      IF p_eh_estorno AND v_patch_q + 0.001 < v_old_q THEN
        -- Estorno: so forca diminuicao neste item; outros itens do mesmo desenho
        -- mantem GREATEST (nao apaga baixas concorrentes).
        v_merged_q := LEAST(GREATEST(v_patch_q, 0), v_proj_q);
      ELSE
        -- Baixa concorrente: GREATEST evita lost update / baixa fantasma.
        v_merged_q := LEAST(GREATEST(v_old_q, v_patch_q), v_proj_q);
      END IF;

      IF v_item_id <> '' THEN
        v_seen := v_seen || jsonb_build_object(v_item_id, true);
      END IF;

      IF v_current_item IS NOT NULL THEN
        v_itens := v_itens || jsonb_build_array(
          v_current_item || (v_patch_item - 'quantidadeAtendida' - 'quantidade_atendida')
            || jsonb_build_object('quantidadeAtendida', v_merged_q)
        );
      ELSE
        v_itens := v_itens || jsonb_build_array(
          v_patch_item || jsonb_build_object('quantidadeAtendida', v_merged_q)
        );
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_current_doc -> 'itens') = 'array' THEN
    FOR v_current_item IN SELECT value FROM jsonb_array_elements(p_current_doc -> 'itens') LOOP
      v_item_id := btrim(COALESCE(v_current_item ->> 'id', ''));
      IF v_item_id = '' OR (v_seen ? v_item_id) THEN
        CONTINUE;
      END IF;
      v_itens := v_itens || jsonb_build_array(v_current_item);
    END LOOP;
  END IF;

  RETURN v_result || jsonb_build_object('itens', v_itens);
END;
$$;

-- 3) Merge de array de documentos: propaga p_eh_estorno
DROP FUNCTION IF EXISTS public.iso_pro_jsonb_merge_documentos_atendimento_by_id(jsonb, jsonb);

CREATE FUNCTION public.iso_pro_jsonb_merge_documentos_atendimento_by_id(
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
  v_result jsonb := '[]'::jsonb;
  v_row jsonb;
  v_id text;
  v_map jsonb := '{}'::jsonb;
  v_merged_doc jsonb;
  v_current_doc jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'array' THEN
    RETURN COALESCE(p_patch, 'null'::jsonb);
  END IF;

  IF p_current IS NOT NULL AND jsonb_typeof(p_current) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_current) LOOP
      v_id := btrim(COALESCE(v_row ->> 'id', ''));
      IF v_id <> '' THEN
        v_map := v_map || jsonb_build_object(v_id, v_row);
      ELSE
        v_result := v_result || jsonb_build_array(v_row);
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
      v_result := v_result || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  FOR v_id, v_row IN SELECT * FROM jsonb_each(v_map) LOOP
    v_result := v_result || jsonb_build_array(v_row);
  END LOOP;

  RETURN v_result;
END;
$$;

-- 4) Registrar: detecta estorno e passa a flag
CREATE OR REPLACE FUNCTION public.iso_pro_registrar_atendimento_mobile(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_documentos jsonb DEFAULT NULL,
  p_historico_novas jsonb DEFAULT NULL,
  p_lotes_novos jsonb DEFAULT NULL,
  p_sequencia_atendimento bigint DEFAULT NULL,
  p_atendimentos jsonb DEFAULT NULL,
  p_estorno_log_novas jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_current jsonb;
  v_merged jsonb;
  v_tem_alteracao boolean := false;
  v_tem_historico_ou_lote boolean;
  v_eh_estorno boolean := false;
  v_rows int;
BEGIN
  IF p_documentos IS NULL
    AND p_historico_novas IS NULL
    AND p_lotes_novos IS NULL
    AND p_sequencia_atendimento IS NULL
    AND p_atendimentos IS NULL
    AND p_estorno_log_novas IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_tem_historico_ou_lote :=
    (p_historico_novas IS NOT NULL AND jsonb_typeof(p_historico_novas) = 'array' AND jsonb_array_length(p_historico_novas) > 0)
    OR (p_lotes_novos IS NOT NULL AND jsonb_typeof(p_lotes_novos) = 'array' AND jsonb_array_length(p_lotes_novos) > 0)
    OR (p_atendimentos IS NOT NULL AND jsonb_typeof(p_atendimentos) = 'array' AND jsonb_array_length(p_atendimentos) > 0);

  v_eh_estorno :=
    p_estorno_log_novas IS NOT NULL
    AND jsonb_typeof(p_estorno_log_novas) = 'array'
    AND jsonb_array_length(p_estorno_log_novas) > 0;

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

  IF p_documentos IS NOT NULL
    AND jsonb_typeof(p_documentos) = 'array'
    AND jsonb_array_length(p_documentos) > 0 THEN
    PERFORM public.iso_pro_assert_atendimento_documentos_progresso(
      v_current,
      p_documentos,
      v_tem_historico_ou_lote,
      v_eh_estorno
    );
    v_merged := jsonb_set(
      v_merged,
      '{documentos}',
      public.iso_pro_jsonb_merge_documentos_atendimento_by_id(
        v_merged->'documentos',
        p_documentos,
        v_eh_estorno
      ),
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF p_atendimentos IS NOT NULL
    AND jsonb_typeof(p_atendimentos) = 'array'
    AND jsonb_array_length(p_atendimentos) > 0 THEN
    v_merged := jsonb_set(
      v_merged,
      '{atendimentos}',
      public.iso_pro_jsonb_merge_array_by_id(v_merged->'atendimentos', p_atendimentos),
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF p_historico_novas IS NOT NULL
    AND jsonb_typeof(p_historico_novas) = 'array'
    AND jsonb_array_length(p_historico_novas) > 0 THEN
    v_merged := jsonb_set(
      v_merged,
      '{atendimentoHistorico}',
      coalesce(v_merged->'atendimentoHistorico', '[]'::jsonb) || p_historico_novas,
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF p_lotes_novos IS NOT NULL
    AND jsonb_typeof(p_lotes_novos) = 'array'
    AND jsonb_array_length(p_lotes_novos) > 0 THEN
    v_merged := jsonb_set(
      v_merged,
      '{atendimentoLotes}',
      coalesce(v_merged->'atendimentoLotes', '[]'::jsonb) || p_lotes_novos,
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF v_eh_estorno THEN
    v_merged := jsonb_set(
      v_merged,
      '{atendimentoEstornoLog}',
      coalesce(v_merged->'atendimentoEstornoLog', '[]'::jsonb) || p_estorno_log_novas,
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF p_sequencia_atendimento IS NOT NULL THEN
    v_merged := jsonb_set(
      v_merged,
      '{configuracoesSistema}',
      coalesce(v_merged->'configuracoesSistema', '{}'::jsonb)
        || jsonb_build_object('sequenciaAtendimento', p_sequencia_atendimento),
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF NOT v_tem_alteracao THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_merged := v_merged || jsonb_build_object(
    'dataAtualizacao',
    to_char(v_new AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

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

  BEGIN
    PERFORM public.iso_pro_espelhar_documentos_patch_nas_tabelas(p_tenant_id, p_documentos);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) IS
  'Atendimento (mobile+PC): validacao servidor + merge seguro (baixa/estorno) + espelho nas tabelas.';

COMMIT;
