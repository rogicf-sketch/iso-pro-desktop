-- Estorno V2: tabelas normalizadas + RPC transacional idempotente.
-- Fonte de verdade: iso_pro_documento_itens_planejamento + lotes/itens/eventos.
-- Snapshot (atendimentos + estornoLog) atualizado de forma leve para compatibilidade.
BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_atendimento_lotes (
  tenant_id uuid NOT NULL,
  id text NOT NULL,
  numero text NOT NULL,
  status text NOT NULL DEFAULT 'concluido'
    CHECK (status IN ('concluido', 'estornado')),
  version bigint NOT NULL DEFAULT 1,
  documento_id text,
  documento_numero text,
  atendente text,
  recebedor text,
  recebedor_tipo text,
  data_atendimento timestamptz,
  origem text,
  snapshot_atendimento jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS iso_pro_atendimento_lotes_tenant_numero_uidx
  ON public.iso_pro_atendimento_lotes (tenant_id, numero);

CREATE TABLE IF NOT EXISTS public.iso_pro_atendimento_lote_itens (
  tenant_id uuid NOT NULL,
  id text NOT NULL,
  lote_id text NOT NULL,
  documento_item_id text NOT NULL,
  documento_id text,
  documento_numero text,
  codigo text NOT NULL,
  descricao text,
  unidade text,
  quantidade_atendida numeric NOT NULL DEFAULT 0 CHECK (quantidade_atendida >= 0),
  quantidade_retirada_original numeric NOT NULL DEFAULT 0 CHECK (quantidade_retirada_original >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, lote_id)
    REFERENCES public.iso_pro_atendimento_lotes (tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_lote_itens_lote_idx
  ON public.iso_pro_atendimento_lote_itens (tenant_id, lote_id);

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_lote_itens_doc_item_idx
  ON public.iso_pro_atendimento_lote_itens (tenant_id, documento_item_id);

CREATE TABLE IF NOT EXISTS public.iso_pro_atendimento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('baixa', 'estorno')),
  lote_id text,
  lote_numero text,
  documento_item_id text,
  documento_numero text,
  codigo text,
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  idempotency_key text,
  actor_estorna text,
  actor_devolve text,
  motivo text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_eventos_tenant_lote_idx
  ON public.iso_pro_atendimento_eventos (tenant_id, lote_numero, created_at DESC);

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_eventos_idem_idx
  ON public.iso_pro_atendimento_eventos (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.iso_pro_estorno_v2_resultados (
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

ALTER TABLE public.iso_pro_atendimento_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_atendimento_lote_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_atendimento_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_pro_estorno_v2_resultados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'iso_pro_atendimento_lotes'
      AND policyname = 'iso_pro_atendimento_lotes_tenant'
  ) THEN
    CREATE POLICY iso_pro_atendimento_lotes_tenant
      ON public.iso_pro_atendimento_lotes
      FOR ALL TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'iso_pro_atendimento_lote_itens'
      AND policyname = 'iso_pro_atendimento_lote_itens_tenant'
  ) THEN
    CREATE POLICY iso_pro_atendimento_lote_itens_tenant
      ON public.iso_pro_atendimento_lote_itens
      FOR ALL TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'iso_pro_atendimento_eventos'
      AND policyname = 'iso_pro_atendimento_eventos_tenant'
  ) THEN
    CREATE POLICY iso_pro_atendimento_eventos_tenant
      ON public.iso_pro_atendimento_eventos
      FOR ALL TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'iso_pro_estorno_v2_resultados'
      AND policyname = 'iso_pro_estorno_v2_resultados_tenant'
  ) THEN
    CREATE POLICY iso_pro_estorno_v2_resultados_tenant
      ON public.iso_pro_estorno_v2_resultados
      FOR ALL TO anon, authenticated
      USING (tenant_id IS NOT NULL)
      WITH CHECK (tenant_id IS NOT NULL);
  END IF;
END $$;

-- Backfill idempotente a partir do snapshot (lotes + itens).
CREATE OR REPLACE FUNCTION public.iso_pro_backfill_atendimento_lotes_v2(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_payload jsonb;
  v_at jsonb;
  v_item jsonb;
  v_n_lotes int := 0;
  v_n_itens int := 0;
  v_lote_id text;
  v_item_id text;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT payload INTO v_payload
  FROM public.iso_pro_snapshot
  WHERE id = 'default' AND tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'atendimentos') <> 'array' THEN
    RETURN jsonb_build_object('ok', true, 'lotes', 0, 'itens', 0);
  END IF;

  FOR v_at IN SELECT value FROM jsonb_array_elements(v_payload -> 'atendimentos') LOOP
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
      snapshot_atendimento = EXCLUDED.snapshot_atendimento,
      updated_at = now();
    v_n_lotes := v_n_lotes + 1;

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
          updated_at = now();
        v_n_itens := v_n_itens + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'lotes', v_n_lotes, 'itens', v_n_itens);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_backfill_atendimento_lotes_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_backfill_atendimento_lotes_v2(uuid) TO anon, authenticated, service_role;

-- RPC principal
CREATE OR REPLACE FUNCTION public.iso_pro_estornar_atendimento_v2(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_lote_id text,
  p_lote_numero text DEFAULT NULL,
  p_linhas jsonb DEFAULT '[]'::jsonb,
  p_nome_quem_estorna text DEFAULT NULL,
  p_nome_quem_devolve text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  v_existing jsonb;
  v_lote public.iso_pro_atendimento_lotes%ROWTYPE;
  v_linha jsonb;
  v_item_id text;
  v_doc_item_id text;
  v_q numeric;
  v_lote_item public.iso_pro_atendimento_lote_itens%ROWTYPE;
  v_q_restante numeric;
  v_novos_itens jsonb := '[]'::jsonb;
  v_docs_afetados jsonb := '[]'::jsonb;
  v_eventos jsonb := '[]'::jsonb;
  v_status text;
  v_payload jsonb;
  v_atend jsonb;
  v_atend_arr jsonb;
  v_log jsonb;
  v_idx int;
  v_result jsonb;
  v_duration_ms numeric;
  v_scan int;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL
    OR NULLIF(btrim(coalesce(p_idempotency_key, '')), '') IS NULL
    OR NULLIF(btrim(coalesce(p_lote_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT resultado INTO v_existing
  FROM public.iso_pro_estorno_v2_resultados
  WHERE tenant_id = p_tenant_id
    AND idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    RETURN v_existing || jsonb_build_object('idempotent_hit', true);
  END IF;

  -- Garantir lote nas tabelas (lazy backfill do lote pedido).
  PERFORM public.iso_pro_backfill_atendimento_lotes_v2(p_tenant_id);

  SELECT * INTO v_lote
  FROM public.iso_pro_atendimento_lotes
  WHERE tenant_id = p_tenant_id
    AND (
      id = btrim(p_lote_id)
      OR (p_lote_numero IS NOT NULL AND numero = btrim(p_lote_numero))
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Lote nao encontrado para estorno.',
      'code', 'LOTE_NOT_FOUND'
    );
  END IF;

  IF v_lote.status = 'estornado' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Atendimento ja estornado.',
      'code', 'JA_ESTORNADO',
      'lote', jsonb_build_object('id', v_lote.id, 'numero', v_lote.numero, 'status', v_lote.status, 'version', v_lote.version)
    );
  END IF;

  IF p_expected_version IS NOT NULL AND v_lote.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Conflito de versao do lote. Recarregue e tente de novo.',
      'code', 'VERSION_CONFLICT',
      'expected', p_expected_version,
      'current', v_lote.version
    );
  END IF;

  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nenhuma linha para estornar.', 'code', 'EMPTY');
  END IF;

  FOR v_linha IN SELECT value FROM jsonb_array_elements(p_linhas) LOOP
    v_item_id := NULLIF(btrim(coalesce(v_linha ->> 'atendimentoItemId', v_linha ->> 'id', '')), '');
    v_doc_item_id := NULLIF(btrim(coalesce(v_linha ->> 'documentoItemId', '')), '');
    v_q := coalesce(NULLIF(v_linha ->> 'quantidade', '')::numeric, 0);
    IF v_q <= 0 THEN
      RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_SEM_PROGRESSO'
        USING ERRCODE = 'P0001', DETAIL = 'Quantidade de estorno invalida.';
    END IF;

    SELECT * INTO v_lote_item
    FROM public.iso_pro_atendimento_lote_itens
    WHERE tenant_id = p_tenant_id
      AND lote_id = v_lote.id
      AND (
        (v_item_id IS NOT NULL AND id = v_item_id)
        OR (v_doc_item_id IS NOT NULL AND documento_item_id = v_doc_item_id)
      )
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID'
        USING ERRCODE = 'P0001', DETAIL = 'Item do lote nao encontrado.';
    END IF;

    IF v_q > v_lote_item.quantidade_atendida + 0.001 THEN
      RAISE EXCEPTION 'ISO_PRO_ATENDIMENTO_EXCEDE_PENDENTE'
        USING ERRCODE = 'P0001',
          DETAIL = format('quantidade=%s disponivel=%s', v_q, v_lote_item.quantidade_atendida);
    END IF;

    -- Planejamento (SoT)
    UPDATE public.iso_pro_documento_itens_planejamento
    SET
      quantidade_atendida = GREATEST(0, quantidade_atendida - v_q),
      updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND id = v_lote_item.documento_item_id;

    IF NOT FOUND AND NULLIF(btrim(coalesce(v_lote_item.documento_id, '')), '') IS NOT NULL THEN
      UPDATE public.iso_pro_documento_itens_planejamento
      SET
        quantidade_atendida = GREATEST(0, quantidade_atendida - v_q),
        updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND documento_id = v_lote_item.documento_id
        AND lower(btrim(coalesce(codigo, ''))) = lower(btrim(coalesce(v_lote_item.codigo, '')));
    END IF;

    IF NULLIF(btrim(coalesce(v_lote_item.documento_id, '')), '') IS NOT NULL THEN
      UPDATE public.iso_pro_documentos_planejamento d
      SET
        status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status),
        updated_at = now()
      WHERE d.tenant_id = p_tenant_id AND d.id = v_lote_item.documento_id;
    END IF;

    v_q_restante := GREATEST(0, v_lote_item.quantidade_atendida - v_q);

    UPDATE public.iso_pro_atendimento_lote_itens
    SET quantidade_atendida = v_q_restante, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_lote_item.id;

    INSERT INTO public.iso_pro_atendimento_eventos (
      tenant_id, tipo, lote_id, lote_numero, documento_item_id, documento_numero,
      codigo, quantidade, idempotency_key, actor_estorna, actor_devolve, motivo, payload
    ) VALUES (
      p_tenant_id, 'estorno', v_lote.id, v_lote.numero, v_lote_item.documento_item_id,
      v_lote_item.documento_numero, v_lote_item.codigo, v_q, btrim(p_idempotency_key),
      NULLIF(btrim(coalesce(p_nome_quem_estorna, '')), ''),
      NULLIF(btrim(coalesce(p_nome_quem_devolve, '')), ''),
      NULLIF(btrim(coalesce(p_motivo, '')), ''),
      jsonb_build_object(
        'atendimentoItemId', v_lote_item.id,
        'quantidadeRestanteNoLote', v_q_restante
      )
    );

    v_eventos := v_eventos || jsonb_build_array(jsonb_build_object(
      'atendimentoItemId', v_lote_item.id,
      'documentoItemId', v_lote_item.documento_item_id,
      'documentoNumero', v_lote_item.documento_numero,
      'codigoMaterial', v_lote_item.codigo,
      'descricaoMaterial', v_lote_item.descricao,
      'unidade', v_lote_item.unidade,
      'quantidadeEstornada', v_q,
      'quantidadeRestanteNoLote', v_q_restante
    ));

    v_docs_afetados := v_docs_afetados || jsonb_build_array(jsonb_build_object(
      'documentoId', v_lote_item.documento_id,
      'documentoNumero', v_lote_item.documento_numero,
      'documentoItemId', v_lote_item.documento_item_id,
      'codigo', v_lote_item.codigo,
      'delta', -v_q
    ));
  END LOOP;

  -- Itens restantes apos o estorno (ja atualizados acima)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'documentoItemId', i.documento_item_id,
    'documentoNumero', i.documento_numero,
    'codigoMaterial', i.codigo,
    'descricaoMaterial', i.descricao,
    'unidade', i.unidade,
    'quantidadeAtendida', i.quantidade_atendida,
    'quantidadeRetiradaOriginal', i.quantidade_retirada_original
  ) ORDER BY i.codigo), '[]'::jsonb)
  INTO v_novos_itens
  FROM public.iso_pro_atendimento_lote_itens i
  WHERE i.tenant_id = p_tenant_id
    AND i.lote_id = v_lote.id
    AND i.quantidade_atendida > 0.001;

  v_status := CASE WHEN jsonb_array_length(v_novos_itens) = 0 THEN 'estornado' ELSE 'concluido' END;

  UPDATE public.iso_pro_atendimento_lotes
  SET
    status = v_status,
    version = version + 1,
    snapshot_atendimento = coalesce(snapshot_atendimento, '{}'::jsonb)
      || jsonb_build_object('status', v_status, 'itens', v_novos_itens),
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_lote.id
  RETURNING * INTO v_lote;

  -- Projecao leve no snapshot (sem mexer em documentos[])
  SELECT payload INTO v_payload
  FROM public.iso_pro_snapshot
  WHERE id = 'default' AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF FOUND THEN
    v_atend_arr := coalesce(v_payload -> 'atendimentos', '[]'::jsonb);
    v_idx := NULL;
    FOR v_scan IN 0 .. greatest(jsonb_array_length(v_atend_arr) - 1, -1) LOOP
      IF (v_atend_arr -> v_scan ->> 'id') = v_lote.id
        OR (v_atend_arr -> v_scan ->> 'numero') = v_lote.numero THEN
        v_idx := v_scan;
        EXIT;
      END IF;
    END LOOP;

    IF v_idx IS NOT NULL THEN
      v_atend := (v_atend_arr -> v_idx)
        || jsonb_build_object('status', v_status, 'itens', v_novos_itens);
      v_atend_arr := jsonb_set(v_atend_arr, ARRAY[v_idx::text], v_atend, false);
    END IF;

    v_log := coalesce(v_payload -> 'atendimentoEstornoLog', '[]'::jsonb);
    FOR v_linha IN SELECT value FROM jsonb_array_elements(v_eventos) LOOP
      v_log := v_log || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'dataEstorno', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'loteNumero', v_lote.numero,
        'loteId', v_lote.id,
        'atendimentoItemId', v_linha ->> 'atendimentoItemId',
        'documentoNumero', v_linha ->> 'documentoNumero',
        'codigoMaterial', v_linha ->> 'codigoMaterial',
        'descricaoMaterial', v_linha ->> 'descricaoMaterial',
        'unidade', v_linha ->> 'unidade',
        'quantidadeEstornada', (v_linha ->> 'quantidadeEstornada')::numeric,
        'quantidadeRestanteNoLote', (v_linha ->> 'quantidadeRestanteNoLote')::numeric,
        'nomeQuemEstorna', coalesce(p_nome_quem_estorna, ''),
        'nomeQuemDevolve', coalesce(p_nome_quem_devolve, ''),
        'motivoEstorno', coalesce(p_motivo, ''),
        'estornoParcialLote', v_status = 'concluido'
      ));
    END LOOP;

    PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
    UPDATE public.iso_pro_snapshot
    SET
      payload = (coalesce(payload, '{}'::jsonb) - 'documentos')
        || jsonb_build_object(
          'atendimentos', coalesce(v_atend_arr, '[]'::jsonb),
          'atendimentoEstornoLog', v_log,
          'dataAtualizacao', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
      updated_at = now()
    WHERE id = 'default' AND tenant_id = p_tenant_id;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  END IF;

  v_duration_ms := round(EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000.0, 1);

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent_hit', false,
    'duration_ms', v_duration_ms,
    'lote', jsonb_build_object(
      'id', v_lote.id,
      'numero', v_lote.numero,
      'status', v_lote.status,
      'version', v_lote.version,
      'itens', v_novos_itens,
      'documentoId', v_lote.documento_id,
      'documentoNumero', v_lote.documento_numero,
      'atendente', v_lote.atendente,
      'recebedor', v_lote.recebedor,
      'dataAtendimento', v_lote.data_atendimento
    ),
    'itensEstorno', v_eventos,
    'documentosAfetados', v_docs_afetados,
    'nomeQuemEstorna', coalesce(p_nome_quem_estorna, ''),
    'nomeQuemDevolve', coalesce(p_nome_quem_devolve, ''),
    'motivoEstorno', coalesce(p_motivo, ''),
    'estornoParcial', v_status = 'concluido'
  );

  INSERT INTO public.iso_pro_estorno_v2_resultados (tenant_id, idempotency_key, resultado)
  VALUES (p_tenant_id, btrim(p_idempotency_key), v_result)
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_estornar_atendimento_v2(
  uuid, text, text, text, jsonb, text, text, text, bigint
) IS
  'Estorno V2 atomico: tabelas SoT + eventos + projecao leve no snapshot; idempotente.';

REVOKE ALL ON FUNCTION public.iso_pro_estornar_atendimento_v2(
  uuid, text, text, text, jsonb, text, text, text, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_estornar_atendimento_v2(
  uuid, text, text, text, jsonb, text, text, text, bigint
) TO anon, authenticated, service_role;

-- Backfill automatico no deploy (tenant default)
SELECT public.iso_pro_backfill_atendimento_lotes_v2('00000000-0000-0000-0000-000000000001'::uuid);

COMMIT;
