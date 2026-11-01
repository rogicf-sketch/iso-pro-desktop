-- Visualizar esperava o refresh sincrono do mapa inteiro sempre que o cache
-- passava de 5 minutos (agregado de todos os itens + recebimentos, ate 180s).
-- Com cache presente, a leitura devolve o que ja esta gravado. O recalculo
-- fica fora do pedido (importacao / iso_pro_refresh_metricas_planejamento_cache).
-- p_codigos continua a ir a tabela, so com os codigos pedidos.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(
  p_tenant_id uuid,
  p_codigos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_codes text[];
  v_cached jsonb;
  v_map jsonb := '{}'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  IF coalesce(cardinality(v_codes), 0) = 0 THEN
    SELECT c.por_codigo INTO v_cached
    FROM public.iso_pro_metricas_planejamento_cache c
    WHERE c.tenant_id = p_tenant_id;

    IF v_cached IS NULL THEN
      PERFORM public.iso_pro_refresh_metricas_planejamento_cache(p_tenant_id);
      SELECT c.por_codigo INTO v_cached
      FROM public.iso_pro_metricas_planejamento_cache c
      WHERE c.tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
      'porCodigo', coalesce(v_cached, '{}'::jsonb),
      '_source', 'cache',
      '_filtered', false
    );
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('porCodigo', '{}'::jsonb, '_source', 'empty', '_filtered', true);
  END IF;

  WITH docs AS (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS k,
      sum(greatest(coalesce(i.quantidade, 0), 0))::numeric AS prevista,
      sum(greatest(coalesce(i.quantidade_atendida, 0), 0))::numeric AS atendido
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
    WHERE i.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND lower(btrim(i.codigo)) = ANY (v_codes)
    GROUP BY 1
  ),
  recs AS (
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS k,
      sum(greatest(coalesce(ri.quantidade, 0), 0))::numeric AS recebido
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id)
      AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
      AND lower(btrim(ri.codigo)) = ANY (v_codes)
      AND (
        lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
        OR lower(btrim(coalesce(r.status, ''))) IN (
          'conferido', 'parcialmente_conferido', 'divergente'
        )
      )
    GROUP BY 1
  ),
  merged AS (
    SELECT
      coalesce(d.k, r.k) AS k,
      coalesce(d.prevista, 0) AS prevista,
      coalesce(d.atendido, 0) AS atendido,
      coalesce(r.recebido, 0) AS recebido
    FROM docs d
    FULL OUTER JOIN recs r ON r.k = d.k
  )
  SELECT coalesce(
    jsonb_object_agg(
      k,
      jsonb_build_object('prevista', prevista, 'atendido', atendido, 'recebido', recebido)
    ),
    '{}'::jsonb
  )
  INTO v_map
  FROM merged;

  RETURN jsonb_build_object(
    'porCodigo', coalesce(v_map, '{}'::jsonb),
    '_source', 'tables',
    '_filtered', true
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]) IS
  'Metricas: cache gravado (sem refresh no pedido) ou filtro p_codigos.';

COMMIT;
