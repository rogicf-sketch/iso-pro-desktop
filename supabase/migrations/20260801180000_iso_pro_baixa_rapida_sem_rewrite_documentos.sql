-- Baixa rapida: mesma estrategia do estorno — nao regrava a coluna documentos (~7 MB).
-- Fonte de verdade das qAt: tabelas de planejamento (espelho atomico).
-- skip_escala_outbox evita comparacao pesada no trigger apos UPDATE do payload.

BEGIN;

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
  v_tem_alteracao boolean := false;
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

  -- payload para historico/lotes; documentos so para assert (nao e regravado).
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

  IF p_documentos IS NOT NULL
    AND jsonb_typeof(p_documentos) = 'array'
    AND jsonb_array_length(p_documentos) > 0 THEN
    PERFORM public.iso_pro_assert_atendimento_documentos_progresso(
      jsonb_build_object('documentos', COALESCE(v_docs_current, '[]'::jsonb)),
      p_documentos,
      v_tem_historico_ou_lote,
      v_eh_estorno,
      p_tenant_id
    );
    -- Baixa e estorno: qAt nas TABELAS (espelho atomico abaixo).
    -- Evita regravar ~7 MB na coluna documentos a cada operacao.
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

  -- Baixa e estorno: nao comparar blob enorme no trigger de escala.
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

  -- Atomico: falha no espelho reverte a operacao inteira (baixa e estorno).
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
  'Atendimento atomico; baixa e estorno atualizam tabelas+historico/lote sem regravar documentos[] (~7MB).';

COMMIT;
