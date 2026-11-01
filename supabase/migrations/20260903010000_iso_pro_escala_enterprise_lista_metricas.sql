-- Escala enterprise: lista/métricas a 100k–200k+.
-- 1) Índices alinhados a ORDER BY / filtros
-- 2) Lista: count barato sem filtro; ORDER BY usa índice (tenant_id, numero)
-- 3) Métricas: 1 scan docs+itens; timeout maior; opcional p_codigos

BEGIN;

-- --- Índices ---
CREATE INDEX IF NOT EXISTS iso_pro_documentos_planejamento_tenant_numero_sort_idx
  ON public.iso_pro_documentos_planejamento (tenant_id, numero);

CREATE INDEX IF NOT EXISTS iso_pro_documentos_planejamento_tenant_status_idx
  ON public.iso_pro_documentos_planejamento (tenant_id, lower(btrim(status)));

CREATE INDEX IF NOT EXISTS iso_pro_documento_itens_tenant_doc_qty_idx
  ON public.iso_pro_documento_itens_planejamento (tenant_id, documento_id)
  INCLUDE (quantidade, quantidade_atendida, codigo);

CREATE INDEX IF NOT EXISTS iso_pro_recebimentos_tenant_id_idx
  ON public.iso_pro_recebimentos (tenant_id, id);

CREATE INDEX IF NOT EXISTS iso_pro_materiais_tenant_codigo_idx
  ON public.materiais (tenant_id, lower(btrim(codigo)));

-- Contagem rápida por tenant (actualizada no seed / heal; lista usa quando sem filtro)
CREATE TABLE IF NOT EXISTS public.iso_pro_tenant_contagens (
  tenant_id uuid PRIMARY KEY,
  documentos_planejamento bigint NOT NULL DEFAULT 0,
  recebimentos bigint NOT NULL DEFAULT 0,
  materiais bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iso_pro_tenant_contagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iso_pro_tenant_contagens_tenant ON public.iso_pro_tenant_contagens;
CREATE POLICY iso_pro_tenant_contagens_tenant ON public.iso_pro_tenant_contagens
  FOR ALL TO authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_tenant_contagens_service ON public.iso_pro_tenant_contagens;
CREATE POLICY iso_pro_tenant_contagens_service ON public.iso_pro_tenant_contagens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.iso_pro_tenant_contagens FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.iso_pro_tenant_contagens TO authenticated;
GRANT ALL ON TABLE public.iso_pro_tenant_contagens TO service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_refresh_tenant_contagens(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_docs bigint := 0;
  v_rec bigint := 0;
  v_mat bigint := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT count(*) INTO v_docs
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id;

  IF to_regclass('public.iso_pro_recebimentos') IS NOT NULL THEN
    SELECT count(*) INTO v_rec
    FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id;
  END IF;

  IF to_regclass('public.materiais') IS NOT NULL THEN
    SELECT count(*) INTO v_mat
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.iso_pro_tenant_contagens AS c (
    tenant_id, documentos_planejamento, recebimentos, materiais, updated_at
  )
  VALUES (p_tenant_id, v_docs, v_rec, v_mat, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    documentos_planejamento = EXCLUDED.documentos_planejamento,
    recebimentos = EXCLUDED.recebimentos,
    materiais = EXCLUDED.materiais,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'documentos', v_docs,
    'recebimentos', v_rec,
    'materiais', v_mat
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_refresh_tenant_contagens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_refresh_tenant_contagens(uuid)
  TO authenticated, service_role;

-- Mantém contagens após writes (lista O(1) sem filtro)
CREATE OR REPLACE FUNCTION public.iso_pro_tenant_contagens_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col text;
  v_delta bigint;
  v_tid uuid;
BEGIN
  v_col := TG_ARGV[0];
  IF TG_OP = 'INSERT' THEN
    v_tid := NEW.tenant_id;
    v_delta := 1;
  ELSIF TG_OP = 'DELETE' THEN
    v_tid := OLD.tenant_id;
    v_delta := -1;
  ELSE
    RETURN NULL;
  END IF;
  IF v_tid IS NULL OR v_col IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.iso_pro_tenant_contagens AS c (tenant_id, updated_at)
  VALUES (v_tid, now())
  ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now();
  EXECUTE format(
    'UPDATE public.iso_pro_tenant_contagens SET %I = GREATEST(%I + $1, 0), updated_at = now() WHERE tenant_id = $2',
    v_col, v_col
  ) USING v_delta, v_tid;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS iso_pro_documentos_contagens_ai ON public.iso_pro_documentos_planejamento;
CREATE TRIGGER iso_pro_documentos_contagens_ai
  AFTER INSERT ON public.iso_pro_documentos_planejamento
  FOR EACH ROW EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('documentos_planejamento');

DROP TRIGGER IF EXISTS iso_pro_documentos_contagens_ad ON public.iso_pro_documentos_planejamento;
CREATE TRIGGER iso_pro_documentos_contagens_ad
  AFTER DELETE ON public.iso_pro_documentos_planejamento
  FOR EACH ROW EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('documentos_planejamento');

DROP TRIGGER IF EXISTS iso_pro_recebimentos_contagens_ai ON public.iso_pro_recebimentos;
CREATE TRIGGER iso_pro_recebimentos_contagens_ai
  AFTER INSERT ON public.iso_pro_recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('recebimentos');

DROP TRIGGER IF EXISTS iso_pro_recebimentos_contagens_ad ON public.iso_pro_recebimentos;
CREATE TRIGGER iso_pro_recebimentos_contagens_ad
  AFTER DELETE ON public.iso_pro_recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('recebimentos');

DROP TRIGGER IF EXISTS iso_pro_materiais_contagens_ai ON public.materiais;
CREATE TRIGGER iso_pro_materiais_contagens_ai
  AFTER INSERT ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('materiais');

DROP TRIGGER IF EXISTS iso_pro_materiais_contagens_ad ON public.materiais;
CREATE TRIGGER iso_pro_materiais_contagens_ad
  AFTER DELETE ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('materiais');

-- --- Lista rápida ---
CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_planejamento_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_updated timestamptz;
  v_q text;
  v_off int;
  v_lim int;
  v_status text;
  v_total int := 0;
  v_docs jsonb;
  v_eps numeric := 1e-9;
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
  IF v_status IN ('', 'todos', 'all') THEN
    v_status := NULL;
  END IF;
  v_filtros := (v_q <> '' OR v_status IS NOT NULL);

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      '_updatedAt', v_updated,
      'documentos', '[]'::jsonb,
      'total', 0,
      'offset', v_off,
      'limit', v_lim,
      '_source', 'snapshot',
      '_hint', 'Execute iso_pro_sync_documentos_planejamento_from_snapshot para ativar tabelas.'
    );
  END IF;

  -- Sem filtro: contagem cacheada (O(1)); com filtro: COUNT exacto com índices.
  IF NOT v_filtros THEN
    SELECT c.documentos_planejamento::int INTO v_total
    FROM public.iso_pro_tenant_contagens c
    WHERE c.tenant_id = p_tenant_id;
    IF v_total IS NULL THEN
      SELECT count(*)::int INTO v_total
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = p_tenant_id;
    END IF;
  ELSE
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND (
        v_status IS NULL
        OR lower(btrim(coalesce(d.status, ''))) = v_status
      )
      AND (
        v_q = ''
        OR d.numero ILIKE '%' || v_q || '%'
        OR coalesce(d.descricao, '') ILIKE '%' || v_q || '%'
        OR coalesce(d.responsavel, '') ILIKE '%' || v_q || '%'
      );
  END IF;

  WITH pagina AS (
    SELECT
      d.id,
      d.numero,
      d.revisao,
      d.descricao,
      d.responsavel,
      d.data_documento,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_lista
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND (
        v_status IS NULL
        OR lower(btrim(coalesce(d.status, ''))) = v_status
      )
      AND (
        v_q = ''
        OR d.numero ILIKE '%' || v_q || '%'
        OR coalesce(d.descricao, '') ILIKE '%' || v_q || '%'
        OR coalesce(d.responsavel, '') ILIKE '%' || v_q || '%'
      )
    ORDER BY d.numero
    OFFSET v_off
    LIMIT v_lim
  ),
  agg AS (
    SELECT
      i.documento_id,
      count(*)::int AS total_itens,
      coalesce(sum(i.quantidade), 0) AS q_proj,
      coalesce(sum(i.quantidade_atendida), 0) AS q_at
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id
      AND i.documento_id IN (SELECT p.id FROM pagina p)
    GROUP BY i.documento_id
  )
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'numero', f.numero,
          'revisao', f.revisao,
          'descricao', f.descricao,
          'responsavel', f.responsavel,
          'data', f.data_documento,
          'status', CASE
            WHEN lower(f.status_lista) = 'cancelado' THEN 'cancelado'
            WHEN coalesce(a.q_proj, 0) > 0
              AND coalesce(a.q_at, 0) + v_eps >= coalesce(a.q_proj, 0)
              THEN 'atendido'
            ELSE f.status_lista
          END,
          'totalItens', coalesce(a.total_itens, 0),
          'quantidadePlanejada', coalesce(a.q_proj, 0),
          'quantidadeAtendida', coalesce(a.q_at, 0),
          'itens', '[]'::jsonb
        )
        ORDER BY f.numero
      )
      FROM pagina f
      LEFT JOIN agg a ON a.documento_id = f.id
    ),
    '[]'::jsonb
  )
  INTO v_docs;

  RETURN jsonb_build_object(
    '_updatedAt', v_updated,
    'documentos', v_docs,
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables',
    '_totalMode', CASE WHEN v_filtros THEN 'exact' ELSE 'cached' END
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int, text) IS
  'Lista paginada enterprise: total cacheado sem filtro; ORDER BY numero indexado.';

-- --- Métricas: 1 scan docs+itens + p_codigos opcional ---
DROP FUNCTION IF EXISTS public.iso_pro_sum_metricas_planejamento_por_codigo(uuid);

CREATE OR REPLACE FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(
  p_tenant_id uuid,
  p_codigos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_prev jsonb := '{}'::jsonb;
  v_at jsonb := '{}'::jsonb;
  v_rec jsonb := '{}'::jsonb;
  v_out jsonb := '{}'::jsonb;
  v_codes text[];
  r record;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object('porCodigo', '{}'::jsonb, '_source', 'empty');
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  -- Um unico scan: prevista + atendido
  SELECT
    coalesce(jsonb_object_agg(k, prevista), '{}'::jsonb),
    coalesce(jsonb_object_agg(k, atendido), '{}'::jsonb)
  INTO v_prev, v_at
  FROM (
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
      AND (
        coalesce(cardinality(v_codes), 0) = 0
        OR lower(btrim(i.codigo)) = ANY (v_codes)
      )
    GROUP BY 1
  ) s;

  IF public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    INTO v_rec
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
              WHEN lower(btrim(coalesce(r.status, ''))) IN (
                'conferido', 'parcialmente_conferido', 'divergente'
              )
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
        AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
        AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
        AND (
          coalesce(cardinality(v_codes), 0) = 0
          OR lower(btrim(ri.codigo)) = ANY (v_codes)
        )
        AND (
          lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
          OR lower(btrim(coalesce(r.status, ''))) IN (
            'conferido', 'parcialmente_conferido', 'divergente'
          )
        )
      GROUP BY 1
    ) s;
  END IF;

  FOR r IN
    SELECT DISTINCT k FROM (
      SELECT jsonb_object_keys(v_prev) AS k
      UNION
      SELECT jsonb_object_keys(v_at)
      UNION
      SELECT jsonb_object_keys(v_rec)
    ) u
  LOOP
    v_out := v_out || jsonb_build_object(
      r.k,
      jsonb_build_object(
        'prevista', coalesce((v_prev ->> r.k)::numeric, 0),
        'recebido', coalesce((v_rec ->> r.k)::numeric, 0),
        'atendido', coalesce((v_at ->> r.k)::numeric, 0)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'porCodigo', coalesce(v_out, '{}'::jsonb),
    '_source', 'tables',
    '_filtered', coalesce(cardinality(v_codes), 0) > 0
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]) IS
  'Metricas por codigo (1 scan docs). p_codigos opcional; unica assinatura para PostgREST.';

REVOKE ALL ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_sum_metricas_planejamento_por_codigo(uuid, text[])
  TO authenticated, service_role;

COMMIT;
