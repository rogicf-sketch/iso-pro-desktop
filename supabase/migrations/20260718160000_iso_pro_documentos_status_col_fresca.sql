-- Coluna status de iso_pro_documentos_planejamento sempre fresca.
--
-- Contexto (18/07/2026): a lista paginada passou a ler o status da COLUNA (migration
-- 20260712141000, por velocidade). Mas nada actualizava a coluna: o espelho de atendimento
-- so mexia nas quantidades e o upsert em lote gravava status NULL quando o JSON nao trazia
-- status (caso do restauro de 12/07). Resultado: desenhos atendidos apareciam "Pendente".
--
-- Esta migration fecha o ciclo:
--   1) iso_pro_aplicar_progresso_documento_tabelas recalcula o status apos aplicar quantidades;
--   2) iso_pro_upsert_documentos_planejamento_lote deriva o status quando o JSON nao o traz;
--   3) iso_pro_recalcular_status_documentos_planejamento — backfill por paginas (usado uma vez).

BEGIN;

-- 1) Espelho de atendimento: quantidades + status derivado
CREATE OR REPLACE FUNCTION public.iso_pro_aplicar_progresso_documento_tabelas(
  p_tenant_id uuid,
  p_documento jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_doc_id text;
  v_item jsonb;
  v_item_id text;
BEGIN
  IF p_tenant_id IS NULL OR p_documento IS NULL THEN
    RETURN;
  END IF;
  v_doc_id := NULLIF(btrim(coalesce(p_documento ->> 'id', '')), '');
  IF v_doc_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.iso_pro_documentos_planejamento
    WHERE tenant_id = p_tenant_id AND id = v_doc_id
  ) THEN
    -- Se tabelas ativas noutros docs, faz upsert deste tambem.
    PERFORM public.iso_pro_upsert_documentos_planejamento_lote(
      p_tenant_id,
      jsonb_build_array(p_documento)
    );
    RETURN;
  END IF;

  IF jsonb_typeof(p_documento -> 'itens') = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_documento -> 'itens') LOOP
      v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
      IF v_item_id IS NULL THEN
        UPDATE public.iso_pro_documento_itens_planejamento
        SET
          quantidade_atendida = coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, quantidade_atendida),
          quantidade = coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, quantidade),
          updated_at = now()
        WHERE tenant_id = p_tenant_id
          AND documento_id = v_doc_id
          AND lower(btrim(coalesce(codigo, ''))) = lower(btrim(coalesce(v_item ->> 'codigo', '')));
      ELSE
        UPDATE public.iso_pro_documento_itens_planejamento
        SET
          quantidade_atendida = coalesce(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, quantidade_atendida),
          quantidade = coalesce(NULLIF(v_item ->> 'quantidade', '')::numeric, quantidade),
          updated_at = now()
        WHERE tenant_id = p_tenant_id AND id = v_item_id;
      END IF;
    END LOOP;
  END IF;

  -- Status derivado APOS as quantidades — a lista paginada le esta coluna.
  UPDATE public.iso_pro_documentos_planejamento d
  SET
    status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status),
    updated_at = now()
  WHERE d.tenant_id = p_tenant_id AND d.id = v_doc_id;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_aplicar_progresso_documento_tabelas(uuid, jsonb) IS
  'Espelha atendimento nas tabelas de planejamento (quantidades) e recalcula a coluna status.';

-- 2) Upsert em lote: deriva status quando o JSON nao o traz
CREATE OR REPLACE FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(
  p_tenant_id uuid,
  p_documentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_doc jsonb;
  v_item jsonb;
  v_doc_id text;
  v_item_id text;
  v_docs int := 0;
  v_itens int := 0;
  v_data date;
  v_item_ids text[];
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;
  IF p_documentos IS NULL OR jsonb_typeof(p_documentos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_documentos deve ser array JSON.');
  END IF;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(p_documentos) LOOP
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
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      numero = EXCLUDED.numero,
      revisao = EXCLUDED.revisao,
      data_documento = EXCLUDED.data_documento,
      descricao = EXCLUDED.descricao,
      responsavel = EXCLUDED.responsavel,
      status = COALESCE(EXCLUDED.status, public.iso_pro_documentos_planejamento.status),
      observacao = COALESCE(EXCLUDED.observacao, public.iso_pro_documentos_planejamento.observacao),
      updated_at = now();
    v_docs := v_docs + 1;

    v_item_ids := ARRAY[]::text[];
    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_item_id := NULLIF(btrim(coalesce(v_item ->> 'id', '')), '');
        IF v_item_id IS NULL THEN
          v_item_id := v_doc_id || ':' || coalesce(v_item ->> 'codigo', 'x') || ':' || v_itens::text;
        END IF;
        v_item_ids := array_append(v_item_ids, v_item_id);

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
        ON CONFLICT (tenant_id, id) DO UPDATE SET
          documento_id = EXCLUDED.documento_id,
          codigo = EXCLUDED.codigo,
          descricao = EXCLUDED.descricao,
          unidade = EXCLUDED.unidade,
          quantidade = EXCLUDED.quantidade,
          quantidade_atendida = EXCLUDED.quantidade_atendida,
          localizacao = EXCLUDED.localizacao,
          updated_at = now();
        v_itens := v_itens + 1;
      END LOOP;
    END IF;

    -- Remove linhas orfas deste documento que nao vieram no lote.
    IF coalesce(array_length(v_item_ids, 1), 0) > 0 THEN
      DELETE FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = p_tenant_id
        AND i.documento_id = v_doc_id
        AND NOT (i.id = ANY (v_item_ids));
    ELSE
      DELETE FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = p_tenant_id AND i.documento_id = v_doc_id;
    END IF;

    -- Sem status no JSON (dual-write do PC/web, restauros): deriva dos itens/recebimentos
    -- para a coluna nunca ficar NULL ("Pendente" falso na lista paginada).
    IF NULLIF(btrim(coalesce(v_doc ->> 'status', '')), '') IS NULL THEN
      UPDATE public.iso_pro_documentos_planejamento d
      SET status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status)
      WHERE d.tenant_id = p_tenant_id AND d.id = v_doc_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'documentos', v_docs, 'itens', v_itens);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(uuid, jsonb) IS
  'Upsert de desenhos+itens em lote (import chunked / dual-write); deriva status quando ausente.';

REVOKE ALL ON FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_documentos_planejamento_lote(uuid, jsonb) TO anon, authenticated, service_role;

-- 3) Backfill por paginas (chamar em loop ate devolver restantes = 0)
CREATE OR REPLACE FUNCTION public.iso_pro_recalcular_status_documentos_planejamento(
  p_tenant_id uuid,
  p_limit int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_ids text[];
  v_atualizados int := 0;
  v_restantes int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT array_agg(d.id) INTO v_ids
  FROM (
    SELECT id FROM public.iso_pro_documentos_planejamento
    WHERE tenant_id = p_tenant_id
      AND NULLIF(btrim(coalesce(status, '')), '') IS NULL
    ORDER BY numero
    LIMIT LEAST(GREATEST(coalesce(p_limit, 200), 1), 500)
  ) d;

  IF v_ids IS NOT NULL THEN
    UPDATE public.iso_pro_documentos_planejamento d
    SET status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status)
    WHERE d.tenant_id = p_tenant_id AND d.id = ANY (v_ids);
    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  END IF;

  SELECT count(*)::int INTO v_restantes
  FROM public.iso_pro_documentos_planejamento
  WHERE tenant_id = p_tenant_id
    AND NULLIF(btrim(coalesce(status, '')), '') IS NULL;

  RETURN jsonb_build_object('ok', true, 'atualizados', v_atualizados, 'restantes', v_restantes);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_recalcular_status_documentos_planejamento(uuid, int) IS
  'Backfill da coluna status (docs com status NULL) em paginas — chamar em loop ate restantes=0.';

REVOKE ALL ON FUNCTION public.iso_pro_recalcular_status_documentos_planejamento(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_recalcular_status_documentos_planejamento(uuid, int) TO anon, authenticated, service_role;

COMMIT;
