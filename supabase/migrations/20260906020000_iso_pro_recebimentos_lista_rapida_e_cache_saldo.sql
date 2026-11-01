-- Enterprise: lista recebimentos rápida (padrão docs) + cache de qty recebida por código.
-- Corrige mobile Consulta=0 e Atendimento lento (timeout JWT ~8s).

BEGIN;

-- --- Cache saldo recebido (evita agregar 300k itens a cada Actualizar) ---
CREATE TABLE IF NOT EXISTS public.iso_pro_qty_recebida_por_codigo (
  tenant_id uuid NOT NULL,
  codigo text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS iso_pro_qty_recebida_por_codigo_tenant_idx
  ON public.iso_pro_qty_recebida_por_codigo (tenant_id);

ALTER TABLE public.iso_pro_qty_recebida_por_codigo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_qty_recebida_tenant ON public.iso_pro_qty_recebida_por_codigo;
CREATE POLICY iso_pro_qty_recebida_tenant ON public.iso_pro_qty_recebida_por_codigo
  FOR SELECT TO authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_qty_recebida_service ON public.iso_pro_qty_recebida_por_codigo;
CREATE POLICY iso_pro_qty_recebida_service ON public.iso_pro_qty_recebida_por_codigo
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.iso_pro_qty_recebida_por_codigo FROM PUBLIC;
GRANT SELECT ON TABLE public.iso_pro_qty_recebida_por_codigo TO authenticated;
GRANT ALL ON TABLE public.iso_pro_qty_recebida_por_codigo TO service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_refresh_qty_recebida_por_codigo(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta');
  END IF;

  DELETE FROM public.iso_pro_qty_recebida_por_codigo WHERE tenant_id = p_tenant_id;

  INSERT INTO public.iso_pro_qty_recebida_por_codigo (tenant_id, codigo, quantidade)
  SELECT
    p_tenant_id,
    lower(btrim(coalesce(ri.codigo, ''))),
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
    )::numeric
  FROM public.iso_pro_recebimento_itens ri
  INNER JOIN public.iso_pro_recebimentos r
    ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
  WHERE ri.tenant_id = p_tenant_id
    AND lower(btrim(coalesce(r.status, ''))) <> 'cancelado'
    AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
  GROUP BY 1, 2;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'codigos', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_refresh_qty_recebida_por_codigo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_refresh_qty_recebida_por_codigo(uuid)
  TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '30s'
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

    -- Cache frio: agrega em leitura (sem refresh) — refresh fica a cargo de service/ops.
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

-- --- Lista recebimentos: página primeiro, agg só da página; total cacheado ---
CREATE OR REPLACE FUNCTION public.iso_pro_list_recebimentos_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50,
  p_status text DEFAULT NULL,
  p_modo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_q text;
  v_off int;
  v_lim int;
  v_status text;
  v_modo text;
  v_total int := 0;
  v_rows jsonb;
  v_filtros boolean := false;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_status := lower(btrim(coalesce(p_status, '')));
  v_modo := lower(btrim(coalesce(p_modo, '')));
  IF v_status IN ('', 'todos', 'all') THEN v_status := NULL; END IF;
  IF v_modo IN ('', 'todos', 'all') THEN v_modo := NULL; END IF;
  v_filtros := (v_q <> '' OR v_status IS NOT NULL OR v_modo IS NOT NULL);

  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'recebimentos', '[]'::jsonb,
      'total', 0,
      'offset', v_off,
      'limit', v_lim,
      '_source', 'snapshot',
      '_hint', 'Execute iso_pro_sync_recebimentos_from_snapshot para activar tabelas.'
    );
  END IF;

  IF NOT v_filtros THEN
    SELECT c.recebimentos::int INTO v_total
    FROM public.iso_pro_tenant_contagens c
    WHERE c.tenant_id = p_tenant_id;
    IF v_total IS NULL THEN
      SELECT count(*)::int INTO v_total
      FROM public.iso_pro_recebimentos r
      WHERE r.tenant_id = p_tenant_id;
    END IF;
  ELSE
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (v_modo IS NULL OR lower(btrim(r.modo_recebimento)) = v_modo)
      AND (
        v_q = ''
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.romaneio)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.conferente)) LIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_q || '%'
            )
        )
      );
  END IF;

  WITH pagina AS (
    SELECT
      r.id,
      r.fornecedor,
      r.data_recebimento,
      r.nota_fiscal,
      r.romaneio,
      r.conferente,
      r.modo_recebimento,
      r.status,
      r.data_conferencia
    FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (v_modo IS NULL OR lower(btrim(r.modo_recebimento)) = v_modo)
      AND (
        v_q = ''
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.romaneio)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.conferente)) LIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_q || '%'
            )
        )
      )
    ORDER BY r.data_recebimento DESC NULLS LAST, lower(btrim(r.nota_fiscal)), r.id
    OFFSET v_off
    LIMIT v_lim
  ),
  agg AS (
    SELECT
      i.recebimento_id,
      count(*)::int AS total_itens,
      coalesce(sum(i.quantidade), 0) AS qtd_recebida,
      coalesce(sum(i.quantidade_conferida), 0) AS qtd_conferida,
      coalesce(sum(
        CASE
          WHEN coalesce(i.quantidade, 0) > 0
            AND coalesce(i.quantidade_conferida, 0) < coalesce(i.quantidade, 0)
          THEN 1 ELSE 0
        END
      ), 0)::int AS divergentes
    FROM public.iso_pro_recebimento_itens i
    WHERE i.tenant_id = p_tenant_id
      AND i.recebimento_id IN (SELECT p.id FROM pagina p)
    GROUP BY i.recebimento_id
  )
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'fornecedor', p.fornecedor,
          'dataRecebimento', to_char(p.data_recebimento, 'YYYY-MM-DD'),
          'notaFiscal', p.nota_fiscal,
          'romaneio', p.romaneio,
          'conferente', p.conferente,
          'modoRecebimento', p.modo_recebimento,
          'status', p.status,
          'dataConferencia', CASE
            WHEN p.data_conferencia IS NULL THEN NULL
            ELSE to_char(p.data_conferencia AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          END,
          'totalItens', coalesce(a.total_itens, 0),
          'quantidadeRecebidaTotal', coalesce(a.qtd_recebida, 0),
          'quantidadeConferidaTotal', coalesce(a.qtd_conferida, 0),
          'conferenciaItensDivergentes', coalesce(a.divergentes, 0)
        )
        ORDER BY p.data_recebimento DESC NULLS LAST, lower(btrim(p.nota_fiscal)), p.id
      )
      FROM pagina p
      LEFT JOIN agg a ON a.recebimento_id = p.id
    ),
    '[]'::jsonb
  )
  INTO v_rows;

  RETURN jsonb_build_object(
    'recebimentos', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables',
    '_totalMode', CASE WHEN v_filtros THEN 'exact' ELSE 'cached' END
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_recebimentos_page(uuid, text, int, int, text, text) IS
  'Lista paginada enterprise: total cacheado sem filtro; agg de itens só da página.';

COMMIT;
