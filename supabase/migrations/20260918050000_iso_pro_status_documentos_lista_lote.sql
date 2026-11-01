-- Status da lista alinhado ao detalhe: lote set-based para IDs da página (~20).
-- Corrige coluna persistida (pendente stale) sem N× status_derivado na listagem.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_status_documentos_planejamento_lote(
  p_tenant_id uuid,
  p_ids text[],
  p_persist boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_ids text[];
  v_por_id jsonb := '{}'::jsonb;
  v_atualizados int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[])
  INTO v_ids
  FROM (
    SELECT btrim(u) AS x
    FROM unnest(coalesce(p_ids, ARRAY[]::text[])) AS u
    WHERE btrim(coalesce(u, '')) <> ''
    LIMIT 100
  ) s;

  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('porId', '{}'::jsonb, 'atualizados', 0, '_source', 'empty');
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('porId', '{}'::jsonb, 'atualizados', 0, '_source', 'snapshot');
  END IF;

  WITH
  alvo AS (
    SELECT d.id, lower(btrim(coalesce(d.status, ''))) AS status_col
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND d.id = ANY (v_ids)
  ),
  prevista_cod AS MATERIALIZED (
    SELECT
      lower(btrim(coalesce(di.codigo, ''))) AS codigo,
      sum(di.quantidade) AS prevista
    FROM public.iso_pro_documento_itens_planejamento di
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = di.tenant_id AND d.id = di.documento_id
    WHERE di.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND lower(btrim(coalesce(di.codigo, ''))) <> ''
      AND EXISTS (
        SELECT 1
        FROM public.iso_pro_documento_itens_planejamento x
        WHERE x.tenant_id = p_tenant_id
          AND x.documento_id IN (SELECT id FROM alvo)
          AND lower(btrim(coalesce(x.codigo, ''))) = lower(btrim(coalesce(di.codigo, '')))
      )
    GROUP BY 1
  ),
  recebido_cod AS MATERIALIZED (
    SELECT c.codigo AS codigo, c.quantidade AS recebido
    FROM public.iso_pro_qty_recebida_por_codigo c
    WHERE c.tenant_id = p_tenant_id
      AND EXISTS (
        SELECT 1 FROM prevista_cod p WHERE p.codigo = c.codigo
      )
    UNION ALL
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS codigo,
      sum(
        CASE
          WHEN lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
            THEN greatest(coalesce(ri.quantidade, 0), 0)
          WHEN ri.quantidade_conferida IS NOT NULL
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      ) AS recebido
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND NOT EXISTS (
        SELECT 1 FROM public.iso_pro_qty_recebida_por_codigo c
        WHERE c.tenant_id = p_tenant_id
        LIMIT 1
      )
      AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
      AND (
        lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
        OR lower(btrim(coalesce(r.status, ''))) IN (
          'conferido', 'parcialmente_conferido', 'divergente'
        )
      )
      AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
      AND EXISTS (
        SELECT 1 FROM prevista_cod p
        WHERE p.codigo = lower(btrim(coalesce(ri.codigo, '')))
      )
    GROUP BY 1
  ),
  linha_st AS (
    SELECT
      i.documento_id,
      CASE
        WHEN coalesce(i.quantidade, 0) > 0
          AND coalesce(i.quantidade_atendida, 0) + 1e-9 >= coalesce(i.quantidade, 0)
          THEN 'atendido'
        WHEN coalesce(rc.recebido, 0) <= 1e-9
          THEN 'pendente'
        WHEN coalesce(rc.recebido, 0) + 1e-9 < coalesce(pc.prevista, 0)
          THEN 'parcial'
        ELSE 'recebido'
      END AS st
    FROM public.iso_pro_documento_itens_planejamento i
    LEFT JOIN prevista_cod pc
      ON pc.codigo = lower(btrim(coalesce(i.codigo, '')))
    LEFT JOIN recebido_cod rc
      ON rc.codigo = lower(btrim(coalesce(i.codigo, '')))
    WHERE i.tenant_id = p_tenant_id
      AND i.documento_id IN (SELECT id FROM alvo)
  ),
  doc_novo AS (
    SELECT
      a.id AS documento_id,
      a.status_col,
      CASE
        WHEN a.status_col = 'cancelado' THEN 'cancelado'
        WHEN NOT EXISTS (SELECT 1 FROM linha_st ls WHERE ls.documento_id = a.id)
          THEN 'pendente'
        WHEN (
          SELECT count(*) FILTER (WHERE st = 'atendido') = count(*)
          FROM linha_st ls WHERE ls.documento_id = a.id
        ) THEN 'atendido'
        WHEN (
          SELECT count(*) FILTER (WHERE st IN ('recebido', 'atendido')) = count(*)
          FROM linha_st ls WHERE ls.documento_id = a.id
        ) THEN 'recebido'
        WHEN (
          SELECT count(*) FILTER (WHERE st = 'pendente') = count(*)
          FROM linha_st ls WHERE ls.documento_id = a.id
        ) THEN 'pendente'
        ELSE 'parcial'
      END AS novo
    FROM alvo a
  )
  SELECT coalesce(jsonb_object_agg(documento_id, novo), '{}'::jsonb)
  INTO v_por_id
  FROM doc_novo;

  IF coalesce(p_persist, true) THEN
    UPDATE public.iso_pro_documentos_planejamento d
    SET
      status = n.novo,
      updated_at = now()
    FROM (
      SELECT key AS documento_id, value AS novo
      FROM jsonb_each_text(v_por_id)
    ) n
    WHERE d.tenant_id = p_tenant_id
      AND d.id = n.documento_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM n.novo
      AND n.novo IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado');

    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'porId', coalesce(v_por_id, '{}'::jsonb),
    'atualizados', coalesce(v_atualizados, 0),
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_status_documentos_planejamento_lote(uuid, text[], boolean) IS
  'Status planejamento p/ IDs da página (set-based = detalhe); opcionalmente persiste a coluna.';

REVOKE ALL ON FUNCTION public.iso_pro_status_documentos_planejamento_lote(uuid, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_status_documentos_planejamento_lote(uuid, text[], boolean)
  TO anon, authenticated;

COMMIT;
