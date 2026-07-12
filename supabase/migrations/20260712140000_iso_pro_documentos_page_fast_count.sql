-- Planejamento: lista paginada sem agregar itens em todos os documentos (evita statement timeout).
-- Antes: COUNT simples + página N + agregados só dos IDs da página.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_documentos_tabelas_ativas(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
    LIMIT 1
  );
$$;

REVOKE ALL ON FUNCTION public.iso_pro_documentos_tabelas_ativas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_documentos_tabelas_ativas(uuid) TO anon, authenticated, service_role;

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
SET statement_timeout = '30s'
AS $$
DECLARE
  v_updated timestamptz;
  v_q text;
  v_off int;
  v_lim int;
  v_status text;
  v_total int := 0;
  v_docs jsonb;
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

  -- Total sem tocar em itens
  SELECT count(*)::int INTO v_total
  FROM public.iso_pro_documentos_planejamento d
  WHERE d.tenant_id = p_tenant_id
    AND (
      v_status IS NULL
      OR lower(btrim(coalesce(d.status, ''))) = v_status
    )
    AND (
      v_q = ''
      OR lower(d.numero) LIKE '%' || v_q || '%'
      OR lower(coalesce(d.descricao, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(d.responsavel, '')) LIKE '%' || v_q || '%'
    );

  WITH pagina AS (
    SELECT
      d.id,
      d.numero,
      d.revisao,
      d.descricao,
      d.responsavel,
      d.data_documento,
      d.status AS status_col
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND (
        v_status IS NULL
        OR lower(btrim(coalesce(d.status, ''))) = v_status
      )
      AND (
        v_q = ''
        OR lower(d.numero) LIKE '%' || v_q || '%'
        OR lower(coalesce(d.descricao, '')) LIKE '%' || v_q || '%'
        OR lower(coalesce(d.responsavel, '')) LIKE '%' || v_q || '%'
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
  ),
  pagina_st AS (
    SELECT
      p.*,
      coalesce(a.total_itens, 0) AS total_itens,
      coalesce(a.q_proj, 0) AS q_proj,
      coalesce(a.q_at, 0) AS q_at,
      public.iso_pro_documento_status_derivado(p_tenant_id, p.id, p.status_col) AS status_deriv
    FROM pagina p
    LEFT JOIN agg a ON a.documento_id = p.id
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
          'status', f.status_deriv,
          'totalItens', f.total_itens,
          'quantidadePlanejada', f.q_proj,
          'quantidadeAtendida', f.q_at,
          'itens', '[]'::jsonb
        )
        ORDER BY f.numero
      )
      FROM pagina_st f
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
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int, text) IS
  'Lista paginada rápida: COUNT + página; agregados de itens só nos IDs da página (evita timeout em 1k+ desenhos).';

REVOKE ALL ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int, text) TO anon, authenticated;

COMMIT;
