-- Busca desenhos Atendimento a 200k: sem COUNT exacto com ILIKE; pendentes sem itens embutidos.

BEGIN;

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

  -- Sem filtro: contagem cacheada. Com filtro: NÃO fazer COUNT em 200k (mata mobile).
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
    v_total := -1; -- desconhecido; UI usa length/truncated
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

  IF v_filtros THEN
    v_total := coalesce(jsonb_array_length(v_docs), 0);
    IF v_total >= v_lim THEN
      v_total := v_off + v_lim + 1; -- indica “há mais”
    ELSE
      v_total := v_off + v_total;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    '_updatedAt', v_updated,
    'documentos', v_docs,
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables',
    '_totalMode', CASE WHEN v_filtros THEN 'page' ELSE 'cached' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_limit int DEFAULT 2000
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
  v_lim int;
  v_docs jsonb;
  v_total int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_lim := LEAST(GREATEST(coalesce(p_limit, 2000), 1), 200);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'documentos', '[]'::jsonb,
      'total', 0,
      '_source', 'snapshot',
      '_hint', 'Tabelas de documentos inactivas.'
    );
  END IF;

  -- Página primeiro (sem COUNT global). Itens vazios — hidratação no open do doc.
  WITH candidatos AS (
    SELECT
      d.id,
      d.numero,
      d.revisao,
      d.descricao,
      d.responsavel,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_col
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) <> 'cancelado'
      AND (
        v_q = ''
        OR d.numero ILIKE '%' || v_q || '%'
        OR coalesce(d.descricao, '') ILIKE '%' || v_q || '%'
        OR coalesce(d.revisao, '') ILIKE '%' || v_q || '%'
      )
      AND EXISTS (
        SELECT 1
        FROM public.iso_pro_documento_itens_planejamento i
        WHERE i.tenant_id = d.tenant_id
          AND i.documento_id = d.id
          AND coalesce(i.quantidade, 0) > coalesce(i.quantidade_atendida, 0) + 1e-9
      )
    ORDER BY d.numero
    LIMIT v_lim
  )
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'numero', c.numero,
          'revisao', c.revisao,
          'descricao', coalesce(c.descricao, ''),
          'responsavel', coalesce(c.responsavel, ''),
          'status', c.status_col,
          'itens', '[]'::jsonb
        )
        ORDER BY lower(btrim(c.numero)), lower(btrim(c.revisao))
      )
      FROM candidatos c
    ),
    '[]'::jsonb
  )
  INTO v_docs;

  v_total := coalesce(jsonb_array_length(v_docs), 0);
  IF v_total >= v_lim THEN
    v_total := v_lim + 1;
  END IF;

  RETURN jsonb_build_object(
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'limit', v_lim,
    'truncated', coalesce(jsonb_array_length(v_docs), 0) >= v_lim,
    '_source', 'tables',
    '_totalMode', 'page'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(uuid, text, int) IS
  'Pendentes Atendimento rápido: sem COUNT global; sem itens embutidos (hidratar no open).';

COMMIT;
