-- Hotfix: sum recebida nunca escreve (STABLE / read-only) + SECURITY DEFINER p/ ler cache.
CREATE OR REPLACE FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_payload jsonb;
  v_map jsonb := '{}'::jsonb;
  v_cached int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    SELECT count(*)::int INTO v_cached
    FROM public.iso_pro_qty_recebida_por_codigo c
    WHERE c.tenant_id = p_tenant_id;

    IF coalesce(v_cached, 0) > 0 THEN
      SELECT coalesce(jsonb_object_agg(c.codigo, c.quantidade), '{}'::jsonb)
      INTO v_map
      FROM public.iso_pro_qty_recebida_por_codigo c
      WHERE c.tenant_id = p_tenant_id;
      RETURN jsonb_build_object('porCodigo', coalesce(v_map, '{}'::jsonb), '_source', 'cache');
    END IF;

    SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_map
    FROM (
      SELECT
        lower(btrim(coalesce(ri.codigo, ''))) AS k,
        sum(
          CASE
            WHEN regexp_replace(
                   lower(btrim(coalesce(r.modo_recebimento, 'direto'))),
                   '\s+', '_', 'g'
                 ) IN ('aguardando_conferencia', 'conferencia', 'aguardando')
            THEN CASE
              WHEN lower(btrim(coalesce(r.status, ''))) = 'conferido'
              THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
              ELSE 0
            END
            ELSE greatest(coalesce(ri.quantidade, 0), 0)
          END
        )::numeric AS v
      FROM public.iso_pro_recebimento_itens ri
      INNER JOIN public.iso_pro_recebimentos r
        ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
      WHERE ri.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(r.status, ''))) <> 'cancelado'
        AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
      GROUP BY 1
    ) s;
    RETURN jsonb_build_object('porCodigo', coalesce(v_map, '{}'::jsonb), '_source', 'tables');
  END IF;

  SELECT s.payload INTO v_payload
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL THEN
    RETURN jsonb_build_object('porCodigo', '{}'::jsonb, '_source', 'empty');
  END IF;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  INTO v_map
  FROM (
    SELECT linhas.k, sum(linhas.q)::numeric AS v
    FROM (
      SELECT
        lower(btrim(coalesce(
          item ->> 'codigo',
          item ->> 'codigo_material',
          item ->> 'codigoMaterial',
          ''
        ))) AS k,
        CASE
          WHEN regexp_replace(
                 lower(btrim(coalesce(rec ->> 'modoRecebimento', rec ->> 'modo_recebimento', 'direto'))),
                 '\s+', '_', 'g'
               ) IN ('aguardando_conferencia', 'conferencia', 'aguardando')
          THEN CASE
            WHEN lower(btrim(coalesce(rec ->> 'statusConferencia', rec ->> 'status_conferencia', ''))) = 'conferido'
              OR lower(btrim(coalesce(rec ->> 'status', ''))) = 'conferido'
            THEN public.iso_pro_num_or_zero(coalesce(
                   item ->> 'quantidadeConferida',
                   item ->> 'quantidade_conferida',
                   '0'
                 ))
            ELSE 0
          END
          ELSE public.iso_pro_num_or_zero(coalesce(
                 item ->> 'quantidade',
                 item ->> 'quantidade_recebida',
                 item ->> 'quantidadeRecebida',
                 item ->> 'qtd',
                 '0'
               ))
        END AS q
      FROM jsonb_array_elements(coalesce(v_payload -> 'recebimentos', '[]'::jsonb)) AS rec
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(rec -> 'itens', '[]'::jsonb)) AS item
      WHERE lower(btrim(coalesce(rec ->> 'status', ''))) <> 'cancelado'
    ) AS linhas
    WHERE linhas.k <> ''
    GROUP BY linhas.k
  ) AS s;

  RETURN jsonb_build_object('porCodigo', v_map, '_source', 'snapshot');
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid) TO anon, authenticated, service_role;
