-- Escala enterprise onda 2: métricas em 1 agg + cache; lista materiais count cacheado.

BEGIN;

-- --- Cache métricas globais ---
CREATE TABLE IF NOT EXISTS public.iso_pro_metricas_planejamento_cache (
  tenant_id uuid PRIMARY KEY,
  por_codigo jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iso_pro_metricas_planejamento_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_pro_metricas_cache_tenant ON public.iso_pro_metricas_planejamento_cache;
CREATE POLICY iso_pro_metricas_cache_tenant ON public.iso_pro_metricas_planejamento_cache
  FOR ALL TO authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));
DROP POLICY IF EXISTS iso_pro_metricas_cache_service ON public.iso_pro_metricas_planejamento_cache;
CREATE POLICY iso_pro_metricas_cache_service ON public.iso_pro_metricas_planejamento_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.iso_pro_metricas_planejamento_cache FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.iso_pro_metricas_planejamento_cache TO authenticated;
GRANT ALL ON TABLE public.iso_pro_metricas_planejamento_cache TO service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_refresh_metricas_planejamento_cache(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_map jsonb := '{}'::jsonb;
  v_n int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    INSERT INTO public.iso_pro_metricas_planejamento_cache AS c (tenant_id, por_codigo, refreshed_at)
    VALUES (p_tenant_id, '{}'::jsonb, now())
    ON CONFLICT (tenant_id) DO UPDATE SET por_codigo = '{}'::jsonb, refreshed_at = now();
    RETURN jsonb_build_object('ok', true, 'codes', 0, '_source', 'empty');
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
      AND lower(btrim(coalesce(i.codigo, ''))) <> ''
    GROUP BY 1
  ),
  recs AS (
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS k,
      sum(
        CASE
          WHEN regexp_replace(
                 lower(btrim(coalesce(r.modo_recebimento, 'direto'))),
                 '\s+', '_', 'g'
               ) IN ('aguardando_conferencia', 'conferencia', 'aguardando')
          THEN CASE
            WHEN lower(btrim(coalesce(r.status, ''))) IN (
              'conferido', 'parcialmente_conferido', 'divergente'
            )
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
            ELSE 0
          END
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      )::numeric AS recebido
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id)
      AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
      AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
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
  SELECT
    coalesce(
      jsonb_object_agg(
        k,
        jsonb_build_object(
          'prevista', prevista,
          'atendido', atendido,
          'recebido', recebido
        )
      ),
      '{}'::jsonb
    ),
    count(*)::int
  INTO v_map, v_n
  FROM merged;

  INSERT INTO public.iso_pro_metricas_planejamento_cache AS c (tenant_id, por_codigo, refreshed_at)
  VALUES (p_tenant_id, coalesce(v_map, '{}'::jsonb), now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    por_codigo = EXCLUDED.por_codigo,
    refreshed_at = now();

  RETURN jsonb_build_object('ok', true, 'codes', coalesce(v_n, 0), '_source', 'computed');
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_refresh_metricas_planejamento_cache(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_refresh_metricas_planejamento_cache(uuid)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]);

CREATE OR REPLACE FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(
  p_tenant_id uuid,
  p_codigos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  v_codes text[];
  v_cached jsonb;
  v_refreshed timestamptz;
  v_map jsonb := '{}'::jsonb;
  v_ttl interval := interval '5 minutes';
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  -- Sem filtro: cache (O(1) leitura). Refresh se ausente/stale.
  IF coalesce(cardinality(v_codes), 0) = 0 THEN
    SELECT c.por_codigo, c.refreshed_at INTO v_cached, v_refreshed
    FROM public.iso_pro_metricas_planejamento_cache c
    WHERE c.tenant_id = p_tenant_id;

    IF v_cached IS NULL OR v_refreshed IS NULL OR (now() - v_refreshed) > v_ttl THEN
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

  -- Com p_codigos: query filtrada (pagina UI)
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
  'Metricas: cache global (TTL 5m) ou filtro p_codigos (pagina).';

REVOKE ALL ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[])
  TO authenticated, service_role;

-- --- Lista materiais: count cacheado sem filtro ---
CREATE OR REPLACE FUNCTION public.iso_pro_list_materiais_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50,
  p_disciplina text DEFAULT NULL,
  p_ativo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_q text;
  v_off int;
  v_lim int;
  v_disc text;
  v_ativo text;
  v_total int := 0;
  v_rows jsonb;
  v_filtros boolean := false;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_disc := NULLIF(btrim(coalesce(p_disciplina, '')), '');
  v_ativo := lower(btrim(coalesce(p_ativo, '')));
  IF v_ativo IN ('', 'todos', 'all') THEN v_ativo := NULL; END IF;
  v_filtros := (v_q <> '' OR v_disc IS NOT NULL OR v_ativo IS NOT NULL);

  IF NOT v_filtros THEN
    SELECT c.materiais::int INTO v_total
    FROM public.iso_pro_tenant_contagens c
    WHERE c.tenant_id = p_tenant_id;
  END IF;

  IF v_total IS NULL OR v_filtros THEN
    SELECT count(*)::int INTO v_total
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id
      AND (v_disc IS NULL OR btrim(coalesce(m.disciplina, '')) = v_disc)
      AND (
        v_ativo IS NULL
        OR (v_ativo IN ('ativos', 'ativo', 'true', '1') AND coalesce(m.ativo, true) = true)
        OR (v_ativo IN ('inativos', 'inativo', 'false', '0') AND coalesce(m.ativo, true) = false)
      )
      AND (
        v_q = ''
        OR lower(btrim(coalesce(m.codigo, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(m.codigo_barras, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(m.descricao, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(m.disciplina, ''))) LIKE '%' || v_q || '%'
      );
  END IF;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'codigo', p.codigo,
          'codigoBarras', coalesce(p.codigo_barras, ''),
          'descricao', coalesce(p.descricao, ''),
          'diametro', coalesce(p.diametro, ''),
          'disciplina', coalesce(p.disciplina, ''),
          'unidade', coalesce(p.unidade, 'UN'),
          'peso', coalesce(p.peso, 0),
          'estoqueMinimo', coalesce(p.estoque_minimo, 0),
          'ativo', p.ativo,
          'saldoAtual', 0,
          'observacao', ''
        )
        ORDER BY lower(btrim(p.codigo)), p.id
      )
      FROM (
        SELECT
          m.id,
          m.codigo,
          m.codigo_barras,
          m.descricao,
          m.diametro,
          m.disciplina,
          m.unidade,
          m.peso,
          m.estoque_minimo,
          coalesce(m.ativo, true) AS ativo
        FROM public.materiais m
        WHERE m.tenant_id = p_tenant_id
          AND (v_disc IS NULL OR btrim(coalesce(m.disciplina, '')) = v_disc)
          AND (
            v_ativo IS NULL
            OR (v_ativo IN ('ativos', 'ativo', 'true', '1') AND coalesce(m.ativo, true) = true)
            OR (v_ativo IN ('inativos', 'inativo', 'false', '0') AND coalesce(m.ativo, true) = false)
          )
          AND (
            v_q = ''
            OR lower(btrim(coalesce(m.codigo, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(m.codigo_barras, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(m.descricao, ''))) LIKE '%' || v_q || '%'
            OR lower(btrim(coalesce(m.disciplina, ''))) LIKE '%' || v_q || '%'
          )
        ORDER BY lower(btrim(m.codigo)), m.id
        OFFSET v_off
        LIMIT v_lim
      ) p
    ),
    '[]'::jsonb
  )
  INTO v_rows;

  RETURN jsonb_build_object(
    'materiais', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables',
    '_totalMode', CASE WHEN v_filtros THEN 'exact' ELSE 'cached' END
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_materiais_page(uuid, text, int, int, text, text) IS
  'Lista materiais paginada; total cacheado sem filtro (enterprise).';

COMMIT;
