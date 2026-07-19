-- Fase 0 (Estorno V2): guardrails pos-coluna documentos.
-- - sync snapshot→tabelas preserva quantidade_atendida das tabelas (anti-ressurreicao);
-- - patch_snapshot escreve na coluna documentos;
-- - outbox compara a coluna documentos.
BEGIN;

-- ---------- 1) Outbox: detetar mudancas na coluna documentos ----------
CREATE OR REPLACE FUNCTION public.iso_pro_snapshot_escala_outbox_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patch jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF COALESCE(current_setting('iso_pro.skip_escala_outbox', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  FOREACH v_key IN ARRAY ARRAY[
    'documentos', 'recebimentos', 'inventarios', 'rirRegistros', 'rncRegistros'
  ]
  LOOP
    IF v_key = 'documentos' THEN
      IF TG_OP = 'INSERT' THEN
        IF NEW.documentos IS NOT NULL OR (NEW.payload ? 'documentos') THEN
          v_patch := v_patch || jsonb_build_object('documentos', '1'::jsonb);
        END IF;
      ELSIF (NEW.documentos IS DISTINCT FROM OLD.documentos)
        OR ((NEW.payload -> 'documentos') IS DISTINCT FROM (OLD.payload -> 'documentos')) THEN
        v_patch := v_patch || jsonb_build_object('documentos', '1'::jsonb);
      END IF;
      CONTINUE;
    END IF;

    IF NEW.payload ? v_key AND (
      TG_OP = 'INSERT'
      OR ((OLD.payload -> v_key) IS DISTINCT FROM (NEW.payload -> v_key))
    ) THEN
      v_patch := v_patch || jsonb_build_object(v_key, '1'::jsonb);
    END IF;
  END LOOP;

  IF v_patch <> '{}'::jsonb THEN
    PERFORM public.iso_pro_escala_outbox_enqueue_from_patch(
      NEW.tenant_id, v_patch, NEW.updated_at
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- 2) patch_snapshot: documentos na coluna ----------
CREATE OR REPLACE FUNCTION public.iso_pro_patch_snapshot(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb,
  p_merge_keys text[] DEFAULT NULL
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
  v_docs_current jsonb;
  v_merged jsonb;
  v_docs_merged jsonb;
  v_key text;
  v_value jsonb;
  v_patch_docs jsonb;
  v_tem_docs boolean := false;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_patch_docs := p_patch -> 'documentos';

  IF p_baseline IS NULL THEN
    INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, documentos, updated_at)
    VALUES (
      'default',
      p_tenant_id,
      (COALESCE(p_patch, '{}'::jsonb) - 'documentos'),
      CASE WHEN jsonb_typeof(v_patch_docs) = 'array' THEN v_patch_docs ELSE NULL END,
      v_new
    )
    ON CONFLICT (id, tenant_id) DO UPDATE
    SET
      payload = (COALESCE(public.iso_pro_snapshot.payload, '{}'::jsonb) || (EXCLUDED.payload - 'documentos')) - 'documentos',
      documentos = COALESCE(EXCLUDED.documentos, public.iso_pro_snapshot.documentos),
      updated_at = v_new;
    RETURN v_new;
  END IF;

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

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch) LOOP
    IF v_key = 'documentos' THEN
      IF jsonb_typeof(v_value) = 'array' THEN
        IF p_merge_keys IS NOT NULL AND 'documentos' = ANY (p_merge_keys) THEN
          v_docs_merged := public.iso_pro_jsonb_merge_documentos_atendimento_by_id(
            v_docs_merged,
            v_value,
            false,
            p_tenant_id
          );
        ELSE
          v_docs_merged := v_value;
        END IF;
        v_tem_docs := true;
      END IF;
      CONTINUE;
    END IF;

    IF p_merge_keys IS NOT NULL
      AND v_key = ANY (p_merge_keys)
      AND jsonb_typeof(v_value) = 'array' THEN
      v_merged := jsonb_set(
        v_merged,
        ARRAY[v_key],
        public.iso_pro_jsonb_merge_array_by_id(v_merged -> v_key, v_value),
        true
      );
    ELSE
      v_merged := v_merged || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;

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

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb, text[]) IS
  'Merge atomico; documentos vão para a coluna iso_pro_snapshot.documentos.';

-- ---------- 3) Sync: preservar qAt das tabelas (SoT) ----------
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
  v_q_col numeric;
  v_q_keep numeric;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  v_docs := public.iso_pro_snapshot_documentos_arr(p_tenant_id);

  IF v_docs IS NULL OR jsonb_typeof(v_docs) <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'documentos', 0, 'itens', 0);
  END IF;

  -- Preserva status e quantidade_atendida (tabelas = SoT apos estorno).
  CREATE TEMP TABLE _iso_pro_status_antigos (id text PRIMARY KEY, status text)
    ON COMMIT DROP;
  INSERT INTO _iso_pro_status_antigos (id, status)
  SELECT d.id, d.status
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND NULLIF(btrim(coalesce(d.status, '')), '') IS NOT NULL;

  CREATE TEMP TABLE _iso_pro_qat_antigos (
    id text PRIMARY KEY,
    quantidade_atendida numeric NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _iso_pro_qat_antigos (id, quantidade_atendida)
  SELECT i.id, coalesce(i.quantidade_atendida, 0)
  FROM public.iso_pro_documento_itens_planejamento i
  WHERE i.tenant_id = p_tenant_id;

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

        v_q_col := coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0);
        SELECT a.quantidade_atendida INTO v_q_keep
        FROM _iso_pro_qat_antigos a
        WHERE a.id = v_item_id;
        -- Se a tabela ja tinha valor, mantém (nao ressuscita qAt da coluna stale).
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
          v_item ->> 'codigo',
          v_item ->> 'descricao',
          v_item ->> 'unidade',
          coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, 0),
          v_q_col,
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

  RETURN jsonb_build_object(
    'ok', true,
    'documentos', v_docs_n,
    'itens', v_itens,
    'qatPreservada', true
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_documentos_planejamento_from_snapshot(uuid) IS
  'Sync coluna documentos → tabelas preservando quantidade_atendida (tabelas = SoT).';

COMMIT;
