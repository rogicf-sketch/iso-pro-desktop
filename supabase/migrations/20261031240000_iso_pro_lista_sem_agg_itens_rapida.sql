-- Lista: só cabeçalhos (sem JOIN/agg de itens). OFFSET 4k+ deixa de demorar dezenas de s.
-- Status = coluna do documento; barras de qtd. no Visualizar.

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
SET statement_timeout = '8s'
AS $$
DECLARE
  v_q text;
  v_like text;
  v_off int;
  v_lim int;
  v_status text;
  v_total int := 0;
  v_docs jsonb;
  v_filtros boolean := false;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_like := replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_status := lower(btrim(coalesce(p_status, '')));
  IF v_status IN ('', 'todos', 'all') THEN
    v_status := NULL;
  END IF;
  v_filtros := (v_q <> '' OR v_status IS NOT NULL);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'documentos', '[]'::jsonb,
      'total', 0,
      'offset', v_off,
      'limit', v_lim,
      '_source', 'snapshot'
    );
  END IF;

  IF NOT v_filtros THEN
    SELECT c.documentos_planejamento::int INTO v_total
    FROM public.iso_pro_tenant_contagens c
    WHERE c.tenant_id = p_tenant_id;
    IF v_total IS NULL THEN
      SELECT count(*)::int INTO v_total
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = p_tenant_id;
    END IF;
  END IF;

  IF v_q = '' THEN
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
      ORDER BY d.numero, d.id
      OFFSET v_off
      LIMIT v_lim
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
            'status', f.status_lista,
            'totalItens', 0,
            'quantidadePlanejada', 0,
            'quantidadeAtendida', 0,
            'itens', '[]'::jsonb
          )
          ORDER BY f.numero, f.id
        )
        FROM pagina f
      ),
      '[]'::jsonb
    )
    INTO v_docs;
  ELSE
    WITH pagina AS (
      SELECT
        d.id,
        d.numero,
        d.revisao,
        d.descricao,
        d.responsavel,
        d.data_documento,
        coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_lista,
        CASE
          WHEN lower(btrim(d.numero)) = v_q THEN 0
          WHEN lower(btrim(d.numero)) LIKE v_q || '%' THEN 1
          ELSE 2
        END AS rank_busca
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = p_tenant_id
        AND (
          v_status IS NULL
          OR lower(btrim(coalesce(d.status, ''))) = v_status
        )
        AND (
          lower(btrim(d.numero)) = v_q
          OR lower(btrim(d.numero)) LIKE v_q || '%'
          OR lower(btrim(d.numero)) LIKE '%' || v_like || '%' ESCAPE E'\\'
          OR lower(coalesce(d.descricao, '')) LIKE '%' || v_like || '%' ESCAPE E'\\'
          OR lower(coalesce(d.responsavel, '')) LIKE '%' || v_like || '%' ESCAPE E'\\'
        )
      ORDER BY rank_busca, d.numero, d.id
      OFFSET v_off
      LIMIT v_lim
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
            'status', f.status_lista,
            'totalItens', 0,
            'quantidadePlanejada', 0,
            'quantidadeAtendida', 0,
            'itens', '[]'::jsonb
          )
          ORDER BY f.rank_busca, f.numero, f.id
        )
        FROM pagina f
      ),
      '[]'::jsonb
    )
    INTO v_docs;
  END IF;

  IF v_filtros THEN
    v_total := coalesce(jsonb_array_length(v_docs), 0);
    IF v_total >= v_lim THEN
      v_total := v_off + v_lim + 1;
    ELSE
      v_total := v_off + v_total;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables',
    '_totalMode', CASE WHEN v_filtros THEN 'page' ELSE 'cached' END
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int, text) IS
  'Lista planejamento rápida: só cabeçalhos (sem agg de itens).';

CREATE INDEX IF NOT EXISTS iso_pro_documento_itens_planejamento_tenant_doc_idx
  ON public.iso_pro_documento_itens_planejamento (tenant_id, documento_id);

COMMIT;
