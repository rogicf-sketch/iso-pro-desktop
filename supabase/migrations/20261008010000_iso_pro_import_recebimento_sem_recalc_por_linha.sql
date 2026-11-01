-- Importacao em massa recalculava o estoque em cada linha e a tela ficava presa.
-- A gravacao das notas nao dispara esse recalculo; ele corre uma vez depois.

BEGIN;

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

  PERFORM set_config('iso_pro.skip_qty_sync', 'on', true);

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

COMMIT;

