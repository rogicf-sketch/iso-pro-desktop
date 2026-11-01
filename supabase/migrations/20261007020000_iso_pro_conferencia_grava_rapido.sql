-- A conferencia no telemovel reescrevia a copia inteira da nuvem e,
-- em cada item, recalculava o estoque. A chamada passava do tempo,
-- o aparelho guardava so na fila e a nota voltava para aguardando.
-- Agora a nota entra nas tabelas, o estoque recalcula uma vez,
-- e uma copia antiga nao volta uma nota ja conferida para aguardando.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_trg_qty_item_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_codigo text;
BEGIN
  IF coalesce(current_setting('iso_pro.skip_qty_sync', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_tenant := OLD.tenant_id;
    v_codigo := OLD.codigo;
  ELSE
    v_tenant := NEW.tenant_id;
    v_codigo := NEW.codigo;
  END IF;

  PERFORM public.iso_pro_sync_planejamento_por_codigos(v_tenant, ARRAY[v_codigo]);

  IF TG_OP = 'UPDATE'
     AND lower(btrim(coalesce(OLD.codigo, ''))) IS DISTINCT FROM lower(btrim(coalesce(NEW.codigo, ''))) THEN
    PERFORM public.iso_pro_sync_planejamento_por_codigos(OLD.tenant_id, ARRAY[OLD.codigo]);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_trg_qty_cabecalho_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes text[];
BEGIN
  IF coalesce(current_setting('iso_pro.skip_qty_sync', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(ri.codigo))), ARRAY[]::text[])
  INTO v_codes
  FROM public.iso_pro_recebimento_itens ri
  WHERE ri.tenant_id = NEW.tenant_id
    AND ri.recebimento_id = NEW.id
    AND btrim(coalesce(ri.codigo, '')) <> '';

  PERFORM public.iso_pro_sync_planejamento_por_codigos(NEW.tenant_id, v_codes);
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
  recs_all AS (
    SELECT DISTINCT ON (id) id, rec
    FROM src
    ORDER BY id, ord DESC
  ),
  recs AS (
    SELECT a.id, a.rec
    FROM recs_all a
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.iso_pro_recebimentos cur
      WHERE cur.tenant_id = p_tenant_id
        AND cur.id = a.id
        AND lower(btrim(coalesce(cur.status, ''))) = 'conferido'
        AND public.iso_pro_recebimento_status_from_snapshot(
          coalesce(
            NULLIF(btrim(a.rec ->> 'modoRecebimento'), ''),
            NULLIF(btrim(a.rec ->> 'modo_recebimento'), ''),
            'direto'
          ),
          coalesce(a.rec ->> 'statusConferencia', a.rec ->> 'status_conferencia'),
          a.rec ->> 'status'
        ) IS DISTINCT FROM 'conferido'
    )
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

CREATE OR REPLACE FUNCTION public.iso_pro_submit_escala_domain_patch(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb,
  p_merge_keys text[] DEFAULT NULL,
  p_domain text DEFAULT 'recebimentos'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_domain text;
  v_key text;
  v_allowed text[];
  v_new timestamptz;
  v_base timestamptz;
  v_try integer := 0;
  v_recs jsonb;
  v_codes text[];
  v_ids text[];
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  v_domain := lower(btrim(coalesce(p_domain, 'recebimentos')));

  IF v_domain = 'recebimentos' THEN
    v_allowed := ARRAY['recebimentos', 'materiais', 'dataAtualizacao'];
  ELSIF v_domain IN ('inventarios', 'inventario') THEN
    v_allowed := ARRAY['inventarios', 'materiais', 'estoqueAjustes', 'dataAtualizacao'];
  ELSE
    RAISE EXCEPTION 'ISO_PRO_ESCALA_DOMAIN_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ISO_PRO_ESCALA_DOMAIN_KEY_FORBIDDEN:%', v_key USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF v_domain = 'recebimentos' AND jsonb_typeof(p_patch -> 'recebimentos') = 'array' THEN
    v_recs := p_patch -> 'recebimentos';
    IF jsonb_array_length(v_recs) > 0 THEN
      PERFORM set_config('iso_pro.skip_qty_sync', 'on', true);
      PERFORM public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_recs);
      PERFORM set_config('iso_pro.skip_qty_sync', 'off', true);

      SELECT coalesce(array_agg(DISTINCT btrim(value ->> 'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_recs)
      WHERE btrim(coalesce(value ->> 'id', '')) <> '';

      SELECT coalesce(array_agg(DISTINCT lower(btrim(i.codigo))), ARRAY[]::text[])
      INTO v_codes
      FROM public.iso_pro_recebimento_itens i
      WHERE i.tenant_id = p_tenant_id
        AND i.recebimento_id = ANY (v_ids)
        AND btrim(coalesce(i.codigo, '')) <> '';

      PERFORM public.iso_pro_sync_planejamento_por_codigos(p_tenant_id, v_codes);
    END IF;
  END IF;

  LOOP
    v_try := v_try + 1;
    BEGIN
      PERFORM set_config('lock_timeout', '1500ms', true);
      IF v_try = 1 THEN
        v_base := p_baseline;
      ELSE
        SELECT s.updated_at INTO v_base
        FROM public.iso_pro_snapshot AS s
        WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
      END IF;

      v_new := public.iso_pro_patch_snapshot(p_tenant_id, v_base, p_patch, p_merge_keys);
      EXIT;
    EXCEPTION
      WHEN lock_not_available THEN
        v_new := now();
        EXIT;
      WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM NOT LIKE '%ISO_PRO_SNAPSHOT_CONFLICT%' OR v_try >= 5 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  PERFORM set_config('lock_timeout', '0', true);
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_sync_recebimentos_from_snapshot(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_arr jsonb;
  v_res jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  v_arr := coalesce(v_payload -> 'recebimentos', '[]'::jsonb);
  IF jsonb_typeof(v_arr) <> 'array' THEN
    v_arr := '[]'::jsonb;
  END IF;

  -- Copia a lista. Nao recalcula o estoque item a item (isso estoura o tempo)
  -- e nao volta uma nota ja conferida para aguardando.
  PERFORM set_config('iso_pro.skip_qty_sync', 'on', true);
  v_res := public.iso_pro_upsert_recebimentos_lote(p_tenant_id, v_arr);
  PERFORM set_config('iso_pro.skip_qty_sync', 'off', true);
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text) IS
  'Conferencia: grava a nota nas tabelas, recalcula o estoque uma vez e atualiza a copia.';

REVOKE ALL ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text)
  TO authenticated, service_role;

COMMIT;
