-- Documentos planejamento table-first (SoT).
-- Critico: preservar quantidade_atendida das tabelas (nao ressuscitar qAt do JSON apos estorno).
-- skip_escala_outbox evita re-sync snapshot→tabela.

CREATE OR REPLACE FUNCTION public.iso_pro_write_documentos_sot(
  p_tenant_id uuid,
  p_documentos jsonb,
  p_baseline timestamptz DEFAULT NULL,
  p_atendimento_historico jsonb DEFAULT NULL,
  p_atendimentos jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_doc jsonb;
  v_item jsonb;
  v_doc_id text;
  v_item_id text;
  v_data date;
  v_q_col numeric;
  v_q_keep numeric;
  v_itens int := 0;
  v_proj jsonb := '[]'::jsonb;
  v_proj_doc jsonb;
  v_proj_itens jsonb;
  v_payload_extra jsonb := '{}'::jsonb;
  v_updated int := 0;
  v_status text;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_documentos IS NULL OR jsonb_typeof(p_documentos) <> 'array' THEN
    RAISE EXCEPTION 'ISO_PRO_DOCUMENTOS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Preserva qAt + status das tabelas (SoT apos baixa/estorno).
  CREATE TEMP TABLE _iso_pro_write_doc_status (id text PRIMARY KEY, status text)
    ON COMMIT DROP;
  INSERT INTO _iso_pro_write_doc_status (id, status)
  SELECT d.id, d.status
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND NULLIF(btrim(coalesce(d.status, '')), '') IS NOT NULL;

  CREATE TEMP TABLE _iso_pro_write_doc_qat (
    id text PRIMARY KEY,
    quantidade_atendida numeric NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _iso_pro_write_doc_qat (id, quantidade_atendida)
  SELECT i.id, coalesce(i.quantidade_atendida, 0)
  FROM public.iso_pro_documento_itens_planejamento i
  WHERE i.tenant_id = p_tenant_id;

  DELETE FROM public.iso_pro_documento_itens_planejamento WHERE tenant_id = p_tenant_id;
  DELETE FROM public.iso_pro_documentos_planejamento WHERE tenant_id = p_tenant_id;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documentos) LOOP
    v_doc_id := NULLIF(btrim(coalesce(v_doc ->> 'id', '')), '');
    IF v_doc_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_data := NULLIF(btrim(coalesce(v_doc ->> 'data', v_doc ->> 'dataDocumento', '')), '')::date;
    EXCEPTION WHEN others THEN
      v_data := NULL;
    END;

    v_status := NULLIF(btrim(coalesce(v_doc ->> 'status', '')), '');
    IF v_status IS NULL THEN
      SELECT a.status INTO v_status
      FROM _iso_pro_write_doc_status a
      WHERE a.id = v_doc_id;
    END IF;

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
      v_status,
      coalesce(v_doc ->> 'observacao', v_doc ->> 'observacoes', ''),
      v_new
    );

    v_proj_itens := '[]'::jsonb;
    v_itens := 0;

    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_itens := v_itens + 1;
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_doc_id || ':' || coalesce(
            v_item ->> 'codigo',
            v_item ->> 'codigoMaterial',
            'x'
          ) || ':' || v_itens::text;
        END IF;

        v_q_col := coalesce(
          NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric,
          NULLIF(v_item ->> 'quantidade_atendida', '')::numeric,
          0
        );
        SELECT a.quantidade_atendida INTO v_q_keep
        FROM _iso_pro_write_doc_qat a
        WHERE a.id = v_item_id;
        -- Tabela ganhava: nao ressuscita qAt stale do PC/snapshot apos estorno.
        IF FOUND THEN
          v_q_col := v_q_keep;
        END IF;

        INSERT INTO public.iso_pro_documento_itens_planejamento (
          tenant_id, documento_id, id, codigo, descricao, unidade,
          quantidade, quantidade_atendida, localizacao, updated_at
        ) VALUES (
          p_tenant_id,
          v_doc_id,
          v_item_id,
          coalesce(v_item ->> 'codigo', v_item ->> 'codigoMaterial'),
          coalesce(v_item ->> 'descricao', v_item ->> 'descricaoMaterial'),
          coalesce(v_item ->> 'unidade', 'UN'),
          coalesce(
            NULLIF(v_item ->> 'quantidade', '')::numeric,
            NULLIF(v_item ->> 'quantidadeProjeto', '')::numeric,
            0
          ),
          v_q_col,
          coalesce(v_item ->> 'localizacao', v_item ->> 'localização', ''),
          v_new
        );

        v_proj_itens := v_proj_itens || jsonb_build_array(jsonb_build_object(
          'id', v_item_id,
          'codigo', coalesce(v_item ->> 'codigo', v_item ->> 'codigoMaterial', ''),
          'descricao', coalesce(v_item ->> 'descricao', v_item ->> 'descricaoMaterial', ''),
          'unidade', coalesce(v_item ->> 'unidade', 'UN'),
          'quantidade', coalesce(
            NULLIF(v_item ->> 'quantidade', '')::numeric,
            NULLIF(v_item ->> 'quantidadeProjeto', '')::numeric,
            0
          ),
          'quantidadeAtendida', v_q_col,
          'localizacao', coalesce(v_item ->> 'localizacao', v_item ->> 'localização', '')
        ));
      END LOOP;
    END IF;

    -- Status final: derivado se ainda vazio.
    IF NULLIF(btrim(coalesce(v_status, '')), '') IS NULL
       AND to_regprocedure('public.iso_pro_documento_status_derivado(uuid,text,text)') IS NOT NULL THEN
      v_status := public.iso_pro_documento_status_derivado(p_tenant_id, v_doc_id, v_status);
      UPDATE public.iso_pro_documentos_planejamento
      SET status = v_status
      WHERE tenant_id = p_tenant_id AND id = v_doc_id;
    END IF;

    v_proj_doc := jsonb_build_object(
      'id', v_doc_id,
      'numero', coalesce(v_doc ->> 'numero', ''),
      'revisao', coalesce(NULLIF(btrim(v_doc ->> 'revisao'), ''), 'A'),
      'data', to_char(v_data, 'YYYY-MM-DD'),
      'descricao', coalesce(v_doc ->> 'descricao', ''),
      'responsavel', coalesce(v_doc ->> 'responsavel', ''),
      'status', coalesce(v_status, ''),
      'observacao', coalesce(v_doc ->> 'observacao', v_doc ->> 'observacoes', ''),
      'itens', v_proj_itens
    );
    v_proj := v_proj || jsonb_build_array(v_proj_doc);
  END LOOP;

  IF p_atendimento_historico IS NOT NULL THEN
    v_payload_extra := v_payload_extra || jsonb_build_object('atendimentoHistorico', p_atendimento_historico);
  END IF;
  IF p_atendimentos IS NOT NULL THEN
    v_payload_extra := v_payload_extra || jsonb_build_object('atendimentos', p_atendimentos);
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('documentos', v_proj, 'dataAtualizacao', v_new) || v_payload_extra,
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('documentos', v_proj, 'dataAtualizacao', v_new)
          || v_payload_extra,
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('documentos', v_proj, 'dataAtualizacao', v_new)
          || v_payload_extra,
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_documentos_sot(uuid, jsonb, timestamptz, jsonb, jsonb) IS
  'SoT documentos: tabelas primeiro preservando qAt; projecao snapshot sem outbox.';

REVOKE ALL ON FUNCTION public.iso_pro_write_documentos_sot(uuid, jsonb, timestamptz, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_documentos_sot(uuid, jsonb, timestamptz, jsonb, jsonb)
  TO anon, authenticated, service_role;
