-- Pilar 4 enterprise: canal unico RPC (PC atendimentos + estorno no comando, sem patch paralelo).
-- Pilar 3: contagens admin + reprocessar comando pendente.
BEGIN;

DROP FUNCTION IF EXISTS public.iso_pro_submit_atendimento_comando(uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint);
DROP FUNCTION IF EXISTS public.iso_pro_registrar_atendimento_mobile(uuid, timestamptz, jsonb, jsonb, jsonb, bigint);

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
AS $$
DECLARE
  v_new timestamptz := now();
  v_rows integer;
  v_current jsonb;
  v_merged jsonb;
  v_tem_alteracao boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_baseline IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_documentos IS NULL
    AND p_historico_novas IS NULL
    AND p_lotes_novos IS NULL
    AND p_sequencia_atendimento IS NULL
    AND p_atendimentos IS NULL
    AND p_estorno_log_novas IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
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

  IF p_documentos IS NOT NULL
    AND jsonb_typeof(p_documentos) = 'array'
    AND jsonb_array_length(p_documentos) > 0 THEN
    v_merged := jsonb_set(
      v_merged,
      '{documentos}',
      public.iso_pro_jsonb_merge_array_by_id(v_merged->'documentos', p_documentos),
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

  IF p_estorno_log_novas IS NOT NULL
    AND jsonb_typeof(p_estorno_log_novas) = 'array'
    AND jsonb_array_length(p_estorno_log_novas) > 0 THEN
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

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) IS
  'Atendimento (mobile+PC): merge documentos/atendimentos + append historico/lotes/estorno; canal unico RPC.';

REVOKE ALL ON FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_registrar_atendimento_mobile(
  uuid, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_submit_atendimento_comando(
  p_tenant_id uuid,
  p_idempotency_key text,
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
AS $$
DECLARE
  v_existing timestamptz;
  v_new timestamptz;
  v_payload jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_baseline IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.snapshot_updated_at
  INTO v_existing
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = btrim(p_idempotency_key)
  LIMIT 1;

  IF FOUND AND v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_new := public.iso_pro_registrar_atendimento_mobile(
    p_tenant_id,
    p_baseline,
    p_documentos,
    p_historico_novas,
    p_lotes_novos,
    p_sequencia_atendimento,
    p_atendimentos,
    p_estorno_log_novas
  );

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'documentos', p_documentos,
    'atendimentos', p_atendimentos,
    'atendimentoHistorico', p_historico_novas,
    'atendimentoLotes', p_lotes_novos,
    'atendimentoEstornoLog', p_estorno_log_novas,
    'sequenciaAtendimento', p_sequencia_atendimento
  ));

  INSERT INTO public.iso_pro_atendimento_comandos (
    tenant_id,
    idempotency_key,
    baseline_updated_at,
    payload,
    snapshot_updated_at
  )
  VALUES (
    p_tenant_id,
    btrim(p_idempotency_key),
    p_baseline,
    v_payload,
    v_new
  )
  ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
  SET snapshot_updated_at = COALESCE(public.iso_pro_atendimento_comandos.snapshot_updated_at, EXCLUDED.snapshot_updated_at)
  RETURNING snapshot_updated_at INTO v_existing;

  RETURN COALESCE(v_existing, v_new);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) IS
  'Comando idempotente atendimento (mobile+PC canal unico).';

REVOKE ALL ON FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_list_atendimento_comandos(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total bigint;
  v_pendentes bigint;
  v_sucesso_24h bigint;
  v_items jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT COUNT(*)::bigint INTO v_total
  FROM public.iso_pro_atendimento_comandos AS c WHERE c.tenant_id = p_tenant_id;

  SELECT COUNT(*)::bigint INTO v_pendentes
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id AND c.snapshot_updated_at IS NULL;

  SELECT COUNT(*)::bigint INTO v_sucesso_24h
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.snapshot_updated_at IS NOT NULL
    AND c.created_at >= now() - interval '24 hours';

  FOR v_row IN
    SELECT c.id, c.idempotency_key, c.baseline_updated_at, c.snapshot_updated_at, c.payload, c.created_at
    FROM public.iso_pro_atendimento_comandos AS c
    WHERE c.tenant_id = p_tenant_id
    ORDER BY c.created_at DESC
    LIMIT v_limit OFFSET v_offset
  LOOP
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'idempotencyKey', v_row.idempotency_key,
      'baselineUpdatedAt', v_row.baseline_updated_at,
      'snapshotUpdatedAt', v_row.snapshot_updated_at,
      'createdAt', v_row.created_at,
      'status', CASE WHEN v_row.snapshot_updated_at IS NOT NULL THEN 'ok' ELSE 'pendente' END,
      'historicoCount',
        CASE WHEN jsonb_typeof(v_row.payload->'atendimentoHistorico') = 'array'
          THEN jsonb_array_length(v_row.payload->'atendimentoHistorico') ELSE 0 END,
      'documentosCount',
        CASE WHEN jsonb_typeof(v_row.payload->'documentos') = 'array'
          THEN jsonb_array_length(v_row.payload->'documentos') ELSE 0 END,
      'atendimentosCount',
        CASE WHEN jsonb_typeof(v_row.payload->'atendimentos') = 'array'
          THEN jsonb_array_length(v_row.payload->'atendimentos') ELSE 0 END,
      'estornoCount',
        CASE WHEN jsonb_typeof(v_row.payload->'atendimentoEstornoLog') = 'array'
          THEN jsonb_array_length(v_row.payload->'atendimentoEstornoLog') ELSE 0 END,
      'origem',
        CASE
          WHEN v_row.idempotency_key LIKE 'pc-%' THEN 'pc'
          WHEN v_row.idempotency_key LIKE 'at-%' THEN 'mobile'
          WHEN v_row.idempotency_key LIKE 'reconcile-%' THEN 'reconciliacao'
          ELSE 'outro'
        END
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'pendentes', v_pendentes,
    'sucesso24h', v_sucesso_24h,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_reprocess_atendimento_comando(
  p_tenant_id uuid,
  p_comando_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_baseline timestamptz;
  v_new timestamptz;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_comando_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parametros em falta.');
  END IF;

  SELECT c.id, c.idempotency_key, c.payload, c.snapshot_updated_at
  INTO v_row
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id AND c.id = p_comando_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comando nao encontrado.');
  END IF;

  IF v_row.snapshot_updated_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyOk', true,
      'snapshotUpdatedAt', v_row.snapshot_updated_at
    );
  END IF;

  SELECT s.updated_at INTO v_baseline
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_baseline IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Snapshot inexistente.');
  END IF;

  BEGIN
    v_new := public.iso_pro_submit_atendimento_comando(
      p_tenant_id,
      v_row.idempotency_key,
      v_baseline,
      v_row.payload->'documentos',
      v_row.payload->'atendimentoHistorico',
      v_row.payload->'atendimentoLotes',
      NULLIF(v_row.payload->>'sequenciaAtendimento', '')::bigint,
      v_row.payload->'atendimentos',
      v_row.payload->'atendimentoEstornoLog'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  UPDATE public.iso_pro_atendimento_comandos
  SET snapshot_updated_at = v_new, baseline_updated_at = v_baseline
  WHERE id = p_comando_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'snapshotUpdatedAt', v_new);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_reprocess_atendimento_comando(uuid, uuid) IS
  'Painel admin: reprocessa comando pendente com baseline actual.';

REVOKE ALL ON FUNCTION public.iso_pro_reprocess_atendimento_comando(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reprocess_atendimento_comando(uuid, uuid) TO anon, authenticated;

COMMIT;
