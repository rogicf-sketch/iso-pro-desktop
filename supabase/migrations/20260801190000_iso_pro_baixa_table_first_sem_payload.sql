-- Baixa definitiva table-first: NAO le/reescreve payload jsonb (historico/atendimentos).
-- Causa dos ~50s apos tirar documentos[]: UPDATE do payload ainda regrava TOAST multi-MB.
--
-- Baixa agora:
-- 1) lock so em updated_at (sem SELECT payload/documentos)
-- 2) assert via tabelas
-- 3) upsert lotes/itens
-- 4) espelho qAt nas tabelas (atomico)
-- 5) UPDATE so updated_at (OCC)
-- Comando idempotente continua em iso_pro_atendimento_comandos (submit wrapper).

BEGIN;

-- Assert: se o doc nao esta no JSON (ou JSON nao foi carregado), valida so pelas TABELAS + patch.
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
  v_codigo text;
BEGIN
  IF p_documentos_patch IS NULL
    OR jsonb_typeof(p_documentos_patch) <> 'array'
    OR jsonb_array_length(p_documentos_patch) = 0 THEN
    RETURN;
  END IF;

  FOR v_patch_doc IN SELECT value FROM jsonb_array_elements(p_documentos_patch) LOOP
    v_doc_id := btrim(COALESCE(v_patch_doc ->> 'id', ''));
    v_current_doc := public.iso_pro_find_jsonb_array_element_by_id(p_current -> 'documentos', v_patch_doc ->> 'id');

    IF jsonb_typeof(v_patch_doc -> 'itens') <> 'array' THEN
      CONTINUE;
    END IF;

    FOR v_patch_item IN SELECT value FROM jsonb_array_elements(v_patch_doc -> 'itens') LOOP
      v_item_id := btrim(COALESCE(v_patch_item ->> 'id', ''));
      v_codigo := COALESCE(v_patch_item ->> 'codigo', v_patch_item ->> 'codigoMaterial', '');
      v_proj_q := COALESCE(
        NULLIF(public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidade', 'quantidadeProjeto']), 0),
        0
      );
      v_patch_q := public.iso_pro_num_from_jsonb(v_patch_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);
      v_old_q := NULL;

      IF v_current_doc IS NOT NULL THEN
        v_current_item := CASE
          WHEN v_item_id <> '' THEN public.iso_pro_find_jsonb_array_element_by_id(v_current_doc -> 'itens', v_item_id)
          ELSE NULL
        END;
        IF v_current_item IS NOT NULL THEN
          v_proj_q := COALESCE(
            NULLIF(public.iso_pro_num_from_jsonb(v_current_item, ARRAY['quantidade', 'quantidadeProjeto']), 0),
            v_proj_q,
            0
          );
          v_old_q := public.iso_pro_num_from_jsonb(v_current_item, ARRAY['quantidadeAtendida', 'quantidade_atendida']);
          v_codigo := COALESCE(v_codigo, v_current_item ->> 'codigo', '');
        END IF;
      END IF;

      IF p_tenant_id IS NOT NULL THEN
        v_tab_q := public.iso_pro_qat_item_tabela(p_tenant_id, v_doc_id, v_item_id, v_codigo);
        IF v_tab_q IS NOT NULL THEN
          v_old_q := v_tab_q;
        END IF;
      END IF;

      -- Sem JSON e sem linha na tabela: nao da para validar este item.
      IF v_old_q IS NULL THEN
        IF p_tenant_id IS NOT NULL THEN
          v_old_q := 0;
        ELSE
          CONTINUE;
        END IF;
      END IF;

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

-- Upsert lotes/itens a partir do array atendimentos do comando (PC/mobile).
CREATE OR REPLACE FUNCTION public.iso_pro_upsert_atendimento_lotes_from_json(
  p_tenant_id uuid,
  p_atendimentos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_at jsonb;
  v_item jsonb;
  v_lote_id text;
  v_item_id text;
BEGIN
  IF p_tenant_id IS NULL
    OR p_atendimentos IS NULL
    OR jsonb_typeof(p_atendimentos) <> 'array'
    OR jsonb_array_length(p_atendimentos) = 0 THEN
    RETURN;
  END IF;

  FOR v_at IN SELECT value FROM jsonb_array_elements(p_atendimentos) LOOP
    v_lote_id := NULLIF(btrim(coalesce(v_at ->> 'id', '')), '');
    IF v_lote_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.iso_pro_atendimento_lotes (
      tenant_id, id, numero, status, version, documento_id, documento_numero,
      atendente, recebedor, recebedor_tipo, data_atendimento, origem, snapshot_atendimento, updated_at
    ) VALUES (
      p_tenant_id,
      v_lote_id,
      coalesce(NULLIF(btrim(v_at ->> 'numero'), ''), v_lote_id),
      CASE WHEN lower(btrim(coalesce(v_at ->> 'status', ''))) = 'estornado' THEN 'estornado' ELSE 'concluido' END,
      1,
      v_at ->> 'documentoId',
      v_at ->> 'documentoNumero',
      v_at ->> 'atendente',
      v_at ->> 'recebedor',
      v_at ->> 'recebedorTipo',
      NULLIF(v_at ->> 'dataAtendimento', '')::timestamptz,
      v_at ->> 'origem',
      v_at,
      now()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE
    SET
      numero = EXCLUDED.numero,
      status = EXCLUDED.status,
      documento_id = EXCLUDED.documento_id,
      documento_numero = EXCLUDED.documento_numero,
      atendente = EXCLUDED.atendente,
      recebedor = EXCLUDED.recebedor,
      recebedor_tipo = EXCLUDED.recebedor_tipo,
      data_atendimento = EXCLUDED.data_atendimento,
      origem = EXCLUDED.origem,
      snapshot_atendimento = EXCLUDED.snapshot_atendimento,
      updated_at = now();

    IF jsonb_typeof(v_at -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_at -> 'itens') LOOP
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          CONTINUE;
        END IF;
        INSERT INTO public.iso_pro_atendimento_lote_itens (
          tenant_id, id, lote_id, documento_item_id, documento_id, documento_numero,
          codigo, descricao, unidade, quantidade_atendida, quantidade_retirada_original, updated_at
        ) VALUES (
          p_tenant_id,
          v_item_id,
          v_lote_id,
          coalesce(NULLIF(btrim(v_item ->> 'documentoItemId'), ''), v_item_id),
          v_at ->> 'documentoId',
          coalesce(v_item ->> 'documentoNumero', v_at ->> 'documentoNumero'),
          coalesce(v_item ->> 'codigoMaterial', v_item ->> 'codigo', ''),
          v_item ->> 'descricaoMaterial',
          coalesce(v_item ->> 'unidade', 'UN'),
          coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0),
          coalesce(
            NULLIF(v_item ->> 'quantidadeRetiradaOriginal', '')::numeric,
            NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric,
            0
          ),
          now()
        )
        ON CONFLICT (tenant_id, id) DO UPDATE
        SET
          quantidade_atendida = EXCLUDED.quantidade_atendida,
          quantidade_retirada_original = GREATEST(
            public.iso_pro_atendimento_lote_itens.quantidade_retirada_original,
            EXCLUDED.quantidade_retirada_original
          ),
          descricao = EXCLUDED.descricao,
          updated_at = now();
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_upsert_atendimento_lotes_from_json(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_atendimento_lotes_from_json(uuid, jsonb) TO anon, authenticated, service_role;

-- Lista lotes para Historico do PC (sem baixar blob do snapshot).
CREATE OR REPLACE FUNCTION public.iso_pro_list_atendimento_lotes(
  p_tenant_id uuid,
  p_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
  v_items jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.', 'atendimentos', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(row_at ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      coalesce(l.snapshot_atendimento, '{}'::jsonb) || jsonb_build_object(
        'id', l.id,
        'numero', l.numero,
        'status', l.status,
        'documentoId', l.documento_id,
        'documentoNumero', l.documento_numero,
        'atendente', l.atendente,
        'recebedor', l.recebedor,
        'recebedorTipo', l.recebedor_tipo,
        'dataAtendimento', to_char(l.data_atendimento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'origem', l.origem,
        'itens', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id,
            'documentoItemId', i.documento_item_id,
            'documentoNumero', i.documento_numero,
            'codigoMaterial', i.codigo,
            'descricaoMaterial', i.descricao,
            'unidade', i.unidade,
            'quantidadeAtendida', i.quantidade_atendida,
            'quantidadeRetiradaOriginal', i.quantidade_retirada_original
          ) ORDER BY i.codigo)
          FROM public.iso_pro_atendimento_lote_itens i
          WHERE i.tenant_id = l.tenant_id AND i.lote_id = l.id
        ), '[]'::jsonb)
      ) AS row_at,
      row_number() OVER (
        ORDER BY coalesce(l.data_atendimento, l.created_at) DESC, l.created_at DESC
      ) AS ord
    FROM public.iso_pro_atendimento_lotes l
    WHERE l.tenant_id = p_tenant_id
    ORDER BY coalesce(l.data_atendimento, l.created_at) DESC, l.created_at DESC
    LIMIT v_limit
  ) x;

  RETURN jsonb_build_object(
    'atendimentos', coalesce(v_items, '[]'::jsonb),
    '_updatedAt', public.iso_pro_read_snapshot_cursor(p_tenant_id)
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_atendimento_lotes(uuid, integer) IS
  'Historico de atendimentos a partir das tabelas de lotes (caminho rapido).';

REVOKE ALL ON FUNCTION public.iso_pro_list_atendimento_lotes(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_atendimento_lotes(uuid, integer) TO anon, authenticated, service_role;

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
SET statement_timeout = '60s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_current jsonb;
  v_merged jsonb;
  v_tem_alteracao boolean := false;
  v_tem_historico_ou_lote boolean;
  v_eh_estorno boolean := false;
  v_rows int;
  v_lock_at timestamptz;
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

  -- ========== BAIXA RAPIDA (sem tocar no payload) ==========
  IF NOT v_eh_estorno THEN
    -- Lock OCC sem descomprimir TOAST de payload/documentos.
    SELECT s.updated_at
    INTO v_lock_at
    FROM public.iso_pro_snapshot AS s
    WHERE s.id = 'default'
      AND s.tenant_id = p_tenant_id
      AND s.updated_at = p_baseline
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
    END IF;

    IF p_documentos IS NOT NULL
      AND jsonb_typeof(p_documentos) = 'array'
      AND jsonb_array_length(p_documentos) > 0 THEN
      PERFORM public.iso_pro_assert_atendimento_documentos_progresso(
        jsonb_build_object('documentos', '[]'::jsonb),
        p_documentos,
        v_tem_historico_ou_lote,
        false,
        p_tenant_id
      );
      v_tem_alteracao := true;
    END IF;

    IF p_atendimentos IS NOT NULL
      AND jsonb_typeof(p_atendimentos) = 'array'
      AND jsonb_array_length(p_atendimentos) > 0 THEN
      PERFORM public.iso_pro_upsert_atendimento_lotes_from_json(p_tenant_id, p_atendimentos);
      v_tem_alteracao := true;
    ELSIF v_tem_historico_ou_lote THEN
      v_tem_alteracao := true;
    END IF;

    IF p_sequencia_atendimento IS NOT NULL THEN
      v_tem_alteracao := true;
    END IF;

    IF NOT v_tem_alteracao THEN
      RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
    UPDATE public.iso_pro_snapshot
    SET updated_at = v_new
    WHERE id = 'default'
      AND tenant_id = p_tenant_id
      AND updated_at = p_baseline;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
    END IF;

    IF p_documentos IS NOT NULL
      AND jsonb_typeof(p_documentos) = 'array'
      AND jsonb_array_length(p_documentos) > 0 THEN
      PERFORM public.iso_pro_espelhar_documentos_patch_nas_tabelas(p_tenant_id, p_documentos);
    END IF;

    RETURN v_new;
  END IF;

  -- ========== ESTORNO (legado via registrar): payload leve, sem documentos[] ==========
  SELECT s.payload
  INTO v_current
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id
    AND s.updated_at = p_baseline
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_merged := COALESCE(v_current, '{}'::jsonb) - 'documentos';

  IF p_documentos IS NOT NULL
    AND jsonb_typeof(p_documentos) = 'array'
    AND jsonb_array_length(p_documentos) > 0 THEN
    PERFORM public.iso_pro_assert_atendimento_documentos_progresso(
      jsonb_build_object('documentos', '[]'::jsonb),
      p_documentos,
      v_tem_historico_ou_lote,
      true,
      p_tenant_id
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
    PERFORM public.iso_pro_upsert_atendimento_lotes_from_json(p_tenant_id, p_atendimentos);
    v_tem_alteracao := true;
  END IF;

  v_merged := jsonb_set(
    v_merged,
    '{atendimentoEstornoLog}',
    COALESCE(v_merged->'atendimentoEstornoLog', '[]'::jsonb) || p_estorno_log_novas,
    true
  );
  v_tem_alteracao := true;

  IF NOT v_tem_alteracao THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_merged := v_merged || jsonb_build_object(
    'dataAtualizacao',
    to_char(v_new AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  UPDATE public.iso_pro_snapshot
  SET payload = v_merged,
      updated_at = v_new
  WHERE id = 'default'
    AND tenant_id = p_tenant_id
    AND updated_at = p_baseline;
  PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF p_documentos IS NOT NULL
    AND jsonb_typeof(p_documentos) = 'array'
    AND jsonb_array_length(p_documentos) > 0 THEN
    PERFORM public.iso_pro_espelhar_documentos_patch_nas_tabelas(p_tenant_id, p_documentos);
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) IS
  'Baixa table-first: lotes+qAt sem regravar payload. Estorno legado atualiza log no payload sem documentos[].';

-- Backfill one-shot do historico antigo para as tabelas (Historico do PC).
DO $$
BEGIN
  PERFORM public.iso_pro_backfill_atendimento_lotes_v2('00000000-0000-0000-0000-000000000001'::uuid);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'iso_pro_backfill_atendimento_lotes_v2 skipped: %', SQLERRM;
END $$;

COMMIT;
