-- A importacao em massa gravava uma nota de cada vez. Com muitas notas
-- a API (tecto ~60s) cancelava a gravacao. Um unico INSERT para todas as
-- notas e outro para os itens cabe em segundos.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_try_parse_date(p_text text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF NULLIF(btrim(coalesce(p_text, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p_text)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_try_parse_timestamptz(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF NULLIF(btrim(coalesce(p_text, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p_text)::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_upsert_recebimentos_lote(
  p_tenant_id uuid,
  p_recebimentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_recs int := 0;
  v_itens int := 0;
  v_del int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;
  IF p_recebimentos IS NULL OR jsonb_typeof(p_recebimentos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_recebimentos deve ser array JSON.');
  END IF;

  WITH src AS (
    SELECT btrim(value ->> 'id') AS id, value AS rec, ordinality AS ord
    FROM jsonb_array_elements(p_recebimentos) WITH ORDINALITY
    WHERE btrim(coalesce(value ->> 'id', '')) <> ''
  ),
  recs AS (
    SELECT DISTINCT ON (id) id, rec
    FROM src
    ORDER BY id, ord DESC
  ),
  up_rec AS (
    INSERT INTO public.iso_pro_recebimentos (
      tenant_id, id, fornecedor, data_recebimento, nota_fiscal, romaneio,
      conferente, modo_recebimento, status, observacoes, data_conferencia, updated_at
    )
    SELECT
      p_tenant_id,
      r.id,
      coalesce(r.rec ->> 'fornecedor', r.rec ->> 'fornecedorNome', ''),
      public.iso_pro_try_parse_date(coalesce(r.rec ->> 'dataRecebimento', r.rec ->> 'data')),
      coalesce(r.rec ->> 'notaFiscal', r.rec ->> 'nota', ''),
      coalesce(r.rec ->> 'romaneio', ''),
      coalesce(r.rec ->> 'conferente', r.rec ->> 'conferenteNome', ''),
      coalesce(
        NULLIF(btrim(r.rec ->> 'modoRecebimento'), ''),
        NULLIF(btrim(r.rec ->> 'modo_recebimento'), ''),
        'direto'
      ),
      public.iso_pro_recebimento_status_from_snapshot(
        coalesce(
          NULLIF(btrim(r.rec ->> 'modoRecebimento'), ''),
          NULLIF(btrim(r.rec ->> 'modo_recebimento'), ''),
          'direto'
        ),
        coalesce(r.rec ->> 'statusConferencia', r.rec ->> 'status_conferencia'),
        r.rec ->> 'status'
      ),
      coalesce(r.rec ->> 'observacoes', ''),
      public.iso_pro_try_parse_timestamptz(coalesce(r.rec ->> 'dataConferencia', r.rec ->> 'data_conferencia')),
      now()
    FROM recs r
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      fornecedor = EXCLUDED.fornecedor,
      data_recebimento = EXCLUDED.data_recebimento,
      nota_fiscal = EXCLUDED.nota_fiscal,
      romaneio = EXCLUDED.romaneio,
      conferente = EXCLUDED.conferente,
      modo_recebimento = EXCLUDED.modo_recebimento,
      status = EXCLUDED.status,
      observacoes = EXCLUDED.observacoes,
      data_conferencia = EXCLUDED.data_conferencia,
      updated_at = now()
    RETURNING id
  ),
  raw_items AS (
    SELECT
      r.id AS rec_id,
      t.item,
      t.ord
    FROM recs r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(r.rec -> 'itens') = 'array' THEN r.rec -> 'itens'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS t(item, ord)
    WHERE jsonb_typeof(r.rec -> 'itens') = 'array'
      AND jsonb_array_length(r.rec -> 'itens') > 0
  ),
  norm AS (
    SELECT DISTINCT ON (id)
      rec_id,
      id,
      codigo,
      descricao,
      unidade,
      disciplina,
      localizacao,
      quantidade,
      quantidade_conferida,
      peso_unitario,
      peso_total,
      certificado,
      observacao_item
    FROM (
      SELECT
        rec_id,
        ord,
        coalesce(
          NULLIF(btrim(coalesce(item ->> 'id', '')), ''),
          rec_id || ':' || coalesce(
            NULLIF(btrim(coalesce(item ->> 'codigoMaterial', item ->> 'codigo', '')), ''),
            'x'
          ) || ':' || ord::text
        ) AS id,
        coalesce(item ->> 'codigoMaterial', item ->> 'codigo') AS codigo,
        coalesce(item ->> 'descricaoMaterial', item ->> 'descricao') AS descricao,
        coalesce(NULLIF(btrim(item ->> 'unidade'), ''), 'UN') AS unidade,
        coalesce(item ->> 'disciplina', '') AS disciplina,
        coalesce(item ->> 'localizacao', '') AS localizacao,
        coalesce(
          NULLIF(item ->> 'quantidadeRecebida', '')::numeric,
          NULLIF(item ->> 'quantidade', '')::numeric,
          0
        ) AS quantidade,
        coalesce(NULLIF(item ->> 'quantidadeConferida', '')::numeric, 0) AS quantidade_conferida,
        coalesce(NULLIF(item ->> 'pesoUnitario', '')::numeric, 0) AS peso_unitario,
        coalesce(NULLIF(item ->> 'pesoTotal', '')::numeric, 0) AS peso_total,
        coalesce(item ->> 'certificado', '') AS certificado,
        coalesce(item ->> 'observacaoItem', '') AS observacao_item
      FROM raw_items
    ) x
    ORDER BY id, ord DESC
  ),
  up_items AS (
    INSERT INTO public.iso_pro_recebimento_itens (
      tenant_id, recebimento_id, id, codigo, descricao, unidade, disciplina,
      localizacao, quantidade, quantidade_conferida, peso_unitario, peso_total,
      certificado, observacao_item, updated_at
    )
    SELECT
      p_tenant_id,
      n.rec_id,
      n.id,
      n.codigo,
      n.descricao,
      n.unidade,
      n.disciplina,
      n.localizacao,
      n.quantidade,
      n.quantidade_conferida,
      n.peso_unitario,
      n.peso_total,
      n.certificado,
      n.observacao_item,
      now()
    FROM norm n
    ON CONFLICT (tenant_id, id) DO UPDATE SET
      recebimento_id = EXCLUDED.recebimento_id,
      codigo = EXCLUDED.codigo,
      descricao = EXCLUDED.descricao,
      unidade = EXCLUDED.unidade,
      disciplina = EXCLUDED.disciplina,
      localizacao = EXCLUDED.localizacao,
      quantidade = EXCLUDED.quantidade,
      quantidade_conferida = EXCLUDED.quantidade_conferida,
      peso_unitario = EXCLUDED.peso_unitario,
      peso_total = EXCLUDED.peso_total,
      certificado = EXCLUDED.certificado,
      observacao_item = EXCLUDED.observacao_item,
      updated_at = now()
    RETURNING id
  ),
  del AS (
    DELETE FROM public.iso_pro_recebimento_itens i
    WHERE i.tenant_id = p_tenant_id
      AND i.recebimento_id IN (SELECT DISTINCT rec_id FROM raw_items)
      AND NOT EXISTS (
        SELECT 1
        FROM norm n
        WHERE n.rec_id = i.recebimento_id
          AND n.id = i.id
      )
    RETURNING i.id
  )
  SELECT
    (SELECT count(*)::int FROM up_rec),
    (SELECT count(*)::int FROM up_items),
    (SELECT count(*)::int FROM del)
  INTO v_recs, v_itens, v_del;

  RETURN jsonb_build_object('ok', true, 'recebimentos', coalesce(v_recs, 0), 'itens', coalesce(v_itens, 0));
END;
$$;

COMMENT ON FUNCTION public.iso_pro_upsert_recebimentos_lote(uuid, jsonb) IS
  'Upsert de notas e itens num unico passo (importacao em massa).';

REVOKE ALL ON FUNCTION public.iso_pro_try_parse_date(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_try_parse_timestamptz(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_try_parse_date(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iso_pro_try_parse_timestamptz(text) TO authenticated, service_role;

-- A projecao do snapshot lia os itens nota a nota. Uma passagem so.
CREATE OR REPLACE FUNCTION public.iso_pro_write_recebimentos_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_sync jsonb;
  v_updated int := 0;
  v_ids text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_recebimento_itens WHERE tenant_id = p_tenant_id;
    DELETE FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (replace).')
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_recebimentos(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar recebimentos.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RECEBIMENTOS_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar recebimentos (upsert).')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF p_replace_all IS NOT NULL THEN
    v_arr := p_replace_all;
  ELSE
    SELECT coalesce(array_agg(DISTINCT btrim(u ->> 'id')), ARRAY[]::text[])
    INTO v_ids
    FROM jsonb_array_elements(coalesce(v_upsert, '[]'::jsonb)) u
    WHERE btrim(coalesce(u ->> 'id', '')) <> '';

    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    INTO v_arr
    FROM jsonb_array_elements(
      coalesce(
        (SELECT s.payload -> 'recebimentos'
         FROM public.iso_pro_snapshot s
         WHERE s.id = 'default' AND s.tenant_id = p_tenant_id),
        '[]'::jsonb
      )
    ) elem
    WHERE btrim(coalesce(elem ->> 'id', '')) <> ''
      AND NOT (
        coalesce(cardinality(p_remove_ids), 0) > 0
        AND btrim(elem ->> 'id') = ANY (p_remove_ids)
      )
      AND NOT (
        coalesce(cardinality(v_ids), 0) > 0
        AND btrim(elem ->> 'id') = ANY (v_ids)
      );

    IF jsonb_typeof(v_upsert) = 'array' AND jsonb_array_length(v_upsert) > 0 THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    END IF;
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('recebimentos', v_arr, 'dataAtualizacao', v_new),
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

  BEGIN
    PERFORM public.iso_pro_refresh_qty_recebida_por_codigo(p_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'iso_pro_refresh_qty_recebida_por_codigo falhou: %', SQLERRM;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_recebimentos_sot(uuid, timestamptz, jsonb, text[], jsonb) IS
  'SoT recebimentos: lote unico nas tabelas + projecao do array numa passagem.';

COMMIT;
