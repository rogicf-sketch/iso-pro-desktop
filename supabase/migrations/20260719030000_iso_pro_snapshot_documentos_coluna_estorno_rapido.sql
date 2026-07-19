-- Estorno rapido sem regravar 7+ MB de documentos[] no payload.
--
-- Causa dos ~37s fixos: UPDATE em iso_pro_snapshot.payload (jsonb unico de 8,5 MB)
-- mesmo quando so mudam atendimentos/log. documentos sozinhos sao ~7,2 MB.
--
-- Esta migration:
-- 1) move documentos para coluna propria;
-- 2) no estorno, NAO reescreve a coluna documentos (atualiza tabelas + lote + log);
-- 3) baixas continuam a atualizar a coluna documentos;
-- 4) merge/assert passam a preferir quantidade_atendida das TABELAS (fonte de verdade).
BEGIN;

-- ---------- 1) Coluna separada ----------
ALTER TABLE public.iso_pro_snapshot
  ADD COLUMN IF NOT EXISTS documentos jsonb;

UPDATE public.iso_pro_snapshot
SET
  documentos = COALESCE(documentos, payload -> 'documentos'),
  payload = CASE
    WHEN payload ? 'documentos' THEN (payload - 'documentos')
    ELSE payload
  END
WHERE id = 'default'
  AND (
    documentos IS NULL
    OR (payload ? 'documentos')
  );

CREATE OR REPLACE FUNCTION public.iso_pro_snapshot_documentos_arr(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    s.documentos,
    s.payload -> 'documentos',
    '[]'::jsonb
  )
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;
$$;

-- ---------- 2) Leitura de slices inclui a coluna ----------
CREATE OR REPLACE FUNCTION public.iso_pro_read_snapshot_slices(
  p_tenant_id uuid,
  p_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_documentos jsonb;
  v_updated timestamptz;
  v_result jsonb := '{}'::jsonb;
  k text;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RETURN jsonb_build_object('_error', 'Parametros invalidos.');
  END IF;

  SELECT s.payload, s.documentos, s.updated_at
  INTO v_payload, v_documentos, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  v_result := v_result || jsonb_build_object('_updatedAt', v_updated);

  IF v_payload IS NULL AND v_documentos IS NULL THEN
    RETURN v_result;
  END IF;

  v_payload := COALESCE(v_payload, '{}'::jsonb);

  FOREACH k IN ARRAY p_keys LOOP
    IF k IS NULL OR btrim(k) = '' OR k LIKE '\_%' ESCAPE '\' THEN
      CONTINUE;
    END IF;
    IF k = 'documentos' THEN
      v_result := v_result || jsonb_build_object(
        'documentos',
        COALESCE(v_documentos, v_payload -> 'documentos', '[]'::jsonb)
      );
    ELSIF v_payload ? k THEN
      v_result := v_result || jsonb_build_object(k, v_payload -> k);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ---------- 3) old_q a partir das tabelas (anti-ressurreicao pos-estorno) ----------
DROP FUNCTION IF EXISTS public.iso_pro_assert_atendimento_documentos_progresso(jsonb, jsonb, boolean, boolean);
DROP FUNCTION IF EXISTS public.iso_pro_merge_documento_planejamento_atendimento(jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.iso_pro_jsonb_merge_documentos_atendimento_by_id(jsonb, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.iso_pro_qat_item_tabela(
  p_tenant_id uuid,
  p_documento_id text,
  p_item_id text,
  p_codigo text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_q numeric;
BEGIN
  IF p_tenant_id IS NULL OR NULLIF(btrim(COALESCE(p_documento_id, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;

  IF NULLIF(btrim(COALESCE(p_item_id, '')), '') IS NOT NULL THEN
    SELECT i.quantidade_atendida
    INTO v_q
    FROM public.iso_pro_documento_itens_planejamento AS i
    WHERE i.tenant_id = p_tenant_id
      AND i.id = btrim(p_item_id)
    LIMIT 1;
    IF FOUND THEN
      RETURN COALESCE(v_q, 0);
    END IF;
  END IF;

  IF NULLIF(btrim(COALESCE(p_codigo, '')), '') IS NOT NULL THEN
    SELECT i.quantidade_atendida
    INTO v_q
    FROM public.iso_pro_documento_itens_planejamento AS i
    WHERE i.tenant_id = p_tenant_id
      AND i.documento_id = btrim(p_documento_id)
      AND lower(btrim(COALESCE(i.codigo, ''))) = lower(btrim(p_codigo))
    LIMIT 1;
    IF FOUND THEN
      RETURN COALESCE(v_q, 0);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_assert_atendimento_documentos_progresso(
  p_current jsonb,
  p_documentos_patch jsonb,
  p_tem_historico_ou_lote boolean,
  p_eh_estorno boolean DEFAULT false,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
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
  v_tab_q numeric;
  v_doc_id text;
BEGIN
  IF p_documentos_patch IS NULL
    OR jsonb_typeof(p_documentos_patch) <> 'array'
    OR jsonb_array_length(p_documentos_patch) = 0 THEN
    RETURN;
  END IF;

  FOR v_patch_doc IN SELECT value FROM jsonb_array_elements(p_documentos_patch) LOOP
    v_doc_id := btrim(COALESCE(v_patch_doc ->> 'id', ''));
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
      IF p_tenant_id IS NOT NULL THEN
        v_tab_q := public.iso_pro_qat_item_tabela(
          p_tenant_id,
          v_doc_id,
          v_item_id,
          COALESCE(v_patch_item ->> 'codigo', v_current_item ->> 'codigo')
        );
        IF v_tab_q IS NOT NULL THEN
          v_old_q := v_tab_q;
        END IF;
      END IF;
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

CREATE OR REPLACE FUNCTION public.iso_pro_merge_documento_planejamento_atendimento(
  p_current_doc jsonb,
  p_patch_doc jsonb,
  p_eh_estorno boolean DEFAULT false,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  v_tab_q numeric;
  v_doc_id text;
BEGIN
  IF p_patch_doc IS NULL OR jsonb_typeof(p_patch_doc) <> 'object' THEN
    RETURN COALESCE(p_current_doc, p_patch_doc);
  END IF;
  IF p_current_doc IS NULL OR jsonb_typeof(p_current_doc) <> 'object' THEN
    RETURN p_patch_doc;
  END IF;

  v_result := p_current_doc || (p_patch_doc - 'itens');
  v_doc_id := btrim(COALESCE(p_patch_doc ->> 'id', p_current_doc ->> 'id', ''));

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
      IF p_tenant_id IS NOT NULL THEN
        v_tab_q := public.iso_pro_qat_item_tabela(
          p_tenant_id,
          v_doc_id,
          v_item_id,
          COALESCE(v_patch_item ->> 'codigo', v_current_item ->> 'codigo')
        );
        IF v_tab_q IS NOT NULL THEN
          v_old_q := v_tab_q;
        END IF;
      END IF;
      v_patch_q := public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);

      IF v_patch_q > v_proj_q + 0.001 THEN
        RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PLANEJADO' USING ERRCODE = 'P0001';
      END IF;

      IF NOT p_eh_estorno
        AND v_patch_q > v_old_q + 0.001
        AND (v_patch_q - v_old_q) > (v_proj_q - v_old_q) + 0.001 THEN
        RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PENDENTE' USING ERRCODE = 'P0001';
      END IF;

      IF p_eh_estorno AND v_patch_q + 0.001 < v_old_q THEN
        v_merged_q := LEAST(GREATEST(v_patch_q, 0), v_proj_q);
      ELSE
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

    IF jsonb_typeof(p_current_doc -> 'itens') = 'array' THEN
      FOR v_current_item IN SELECT value FROM jsonb_array_elements(p_current_doc -> 'itens') LOOP
        v_item_id := btrim(COALESCE(v_current_item ->> 'id', ''));
        IF v_item_id <> '' AND (v_seen ? v_item_id) THEN
          CONTINUE;
        END IF;
        v_itens := v_itens || jsonb_build_array(v_current_item);
      END LOOP;
    END IF;

    v_result := v_result || jsonb_build_object('itens', v_itens);
  END IF;

  RETURN v_result;
END;
$$;

-- merge by id precisa repassar tenant ao merge de documento
CREATE OR REPLACE FUNCTION public.iso_pro_jsonb_merge_documentos_atendimento_by_id(
  p_current jsonb,
  p_patch jsonb,
  p_eh_estorno boolean DEFAULT false,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
        p_eh_estorno,
        p_tenant_id
      );
      v_result := jsonb_set(v_result, ARRAY[v_idx::text], v_merged_doc, false);
    ELSE
      v_result := v_result || jsonb_build_array(v_row);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ---------- 4) Registrar: estorno nao reescreve coluna documentos ----------
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
SET statement_timeout = '180s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_current jsonb;
  v_docs_current jsonb;
  v_merged jsonb;
  v_docs_merged jsonb;
  v_tem_alteracao boolean := false;
  v_tem_docs boolean := false;
  v_tem_historico_ou_lote boolean;
  v_eh_estorno boolean := false;
  v_rows int;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

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

  SELECT s.payload, COALESCE(s.documentos, s.payload -> 'documentos', '[]'::jsonb)
  INTO v_current, v_docs_current
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id
    AND s.updated_at = p_baseline
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_merged := COALESCE(v_current, '{}'::jsonb) - 'documentos';
  v_docs_merged := COALESCE(v_docs_current, '[]'::jsonb);

  IF p_documentos IS NOT NULL
    AND jsonb_typeof(p_documentos) = 'array'
    AND jsonb_array_length(p_documentos) > 0 THEN
    PERFORM public.iso_pro_assert_atendimento_documentos_progresso(
      jsonb_build_object('documentos', v_docs_merged),
      p_documentos,
      v_tem_historico_ou_lote,
      v_eh_estorno,
      p_tenant_id
    );
    -- Estorno: fonte de verdade das qAt fica nas TABELAS (espelho atomico abaixo).
    -- Evita regravar ~7 MB na coluna documentos a cada estorno.
    IF NOT v_eh_estorno THEN
      v_docs_merged := public.iso_pro_jsonb_merge_documentos_atendimento_by_id(
        v_docs_merged,
        p_documentos,
        v_eh_estorno,
        p_tenant_id
      );
      v_tem_docs := true;
    END IF;
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
      COALESCE(v_merged->'atendimentoHistorico', '[]'::jsonb) || p_historico_novas,
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
      COALESCE(v_merged->'atendimentoLotes', '[]'::jsonb) || p_lotes_novos,
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF v_eh_estorno THEN
    v_merged := jsonb_set(
      v_merged,
      '{atendimentoEstornoLog}',
      COALESCE(v_merged->'atendimentoEstornoLog', '[]'::jsonb) || p_estorno_log_novas,
      true
    );
    v_tem_alteracao := true;
  END IF;

  IF p_sequencia_atendimento IS NOT NULL THEN
    v_merged := jsonb_set(
      v_merged,
      '{configuracoesSistema}',
      COALESCE(v_merged->'configuracoesSistema', '{}'::jsonb)
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

  IF v_eh_estorno THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  END IF;

  IF v_tem_docs THEN
    UPDATE public.iso_pro_snapshot
    SET payload = v_merged,
        documentos = v_docs_merged,
        updated_at = v_new
    WHERE id = 'default'
      AND tenant_id = p_tenant_id
      AND updated_at = p_baseline;
  ELSE
    UPDATE public.iso_pro_snapshot
    SET payload = v_merged,
        updated_at = v_new
    WHERE id = 'default'
      AND tenant_id = p_tenant_id
      AND updated_at = p_baseline;
  END IF;

  IF v_eh_estorno THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF v_eh_estorno THEN
    -- Atomico: falha no espelho reverte o estorno inteiro.
    PERFORM public.iso_pro_espelhar_documentos_patch_nas_tabelas(p_tenant_id, p_documentos);
  ELSE
    BEGIN
      PERFORM public.iso_pro_espelhar_documentos_patch_nas_tabelas(p_tenant_id, p_documentos);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) IS
  'Atendimento atomico; estorno atualiza tabelas+lote+log sem regravar documentos[] (7MB).';

-- sync from snapshot deve ler a coluna
CREATE OR REPLACE FUNCTION public.iso_pro_snapshot_payload_com_documentos(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(s.payload, '{}'::jsonb)
    || jsonb_build_object(
      'documentos',
      COALESCE(s.documentos, s.payload -> 'documentos', '[]'::jsonb)
    )
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;
$$;

ALTER FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) SET statement_timeout = '180s';

-- Critico: sync snapshot→tabelas deve ler a COLUNA (payload ja nao tem documentos).
CREATE OR REPLACE FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_docs jsonb;
  v_doc jsonb;
  v_item jsonb;
  v_doc_id text;
  v_item_id text;
  v_docs_n int := 0;
  v_itens int := 0;
  v_data date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  v_docs := public.iso_pro_snapshot_documentos_arr(p_tenant_id);

  IF v_docs IS NULL OR jsonb_typeof(v_docs) <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'documentos', 0, 'itens', 0);
  END IF;

  CREATE TEMP TABLE _iso_pro_status_antigos (id text PRIMARY KEY, status text)
    ON COMMIT DROP;
  INSERT INTO _iso_pro_status_antigos (id, status)
  SELECT d.id, d.status
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND NULLIF(btrim(coalesce(d.status, '')), '') IS NOT NULL;

  DELETE FROM public.iso_pro_documento_itens_planejamento WHERE tenant_id = p_tenant_id;
  DELETE FROM public.iso_pro_documentos_planejamento WHERE tenant_id = p_tenant_id;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(v_docs) LOOP
    v_doc_id := NULLIF(btrim(coalesce(v_doc ->> 'id', '')), '');
    IF v_doc_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_data := NULLIF(btrim(coalesce(v_doc ->> 'data', '')), '')::date;
    EXCEPTION WHEN others THEN
      v_data := NULL;
    END;

    INSERT INTO public.iso_pro_documentos_planejamento (
      tenant_id, id, numero, revisao, data_documento, descricao, responsavel, status, observacao, updated_at
    ) VALUES (
      p_tenant_id,
      v_doc_id,
      coalesce(v_doc ->> 'numero', ''),
      coalesce(NULLIF(btrim(v_doc ->> 'revisao'), ''), 'A'),
      v_data,
      v_doc ->> 'descricao',
      v_doc ->> 'responsavel',
      v_doc ->> 'status',
      v_doc ->> 'observacao',
      now()
    )
    ON CONFLICT (tenant_id, id) DO NOTHING;
    v_docs_n := v_docs_n + 1;

    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_doc_id || ':' || coalesce(v_item ->> 'codigo', 'x') || ':' || v_itens::text;
        END IF;
        INSERT INTO public.iso_pro_documento_itens_planejamento (
          tenant_id, documento_id, id, codigo, descricao, unidade,
          quantidade, quantidade_atendida, localizacao, updated_at
        ) VALUES (
          p_tenant_id,
          v_doc_id,
          v_item_id,
          v_item ->> 'codigo',
          v_item ->> 'descricao',
          v_item ->> 'unidade',
          coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, 0),
          coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0),
          coalesce(v_item ->> 'localizacao', v_item ->> 'localização', ''),
          now()
        )
        ON CONFLICT (tenant_id, id) DO NOTHING;
        v_itens := v_itens + 1;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.iso_pro_documentos_planejamento d
  SET status = a.status
  FROM _iso_pro_status_antigos a
  WHERE d.tenant_id = p_tenant_id
    AND d.id = a.id
    AND NULLIF(btrim(coalesce(d.status, '')), '') IS NULL;

  UPDATE public.iso_pro_documentos_planejamento d
  SET status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status)
  WHERE d.tenant_id = p_tenant_id
    AND d.id IN (
      SELECT x.id FROM public.iso_pro_documentos_planejamento x
      WHERE x.tenant_id = p_tenant_id
        AND NULLIF(btrim(coalesce(x.status, '')), '') IS NULL
      ORDER BY x.numero
      LIMIT 500
    );

  RETURN jsonb_build_object('ok', true, 'documentos', v_docs_n, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) IS
  'Sync snapshot/coluna documentos -> tabelas, preservando status.';

COMMIT;
