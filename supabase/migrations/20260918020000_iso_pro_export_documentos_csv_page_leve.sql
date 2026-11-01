-- Export planejamento CSV: página LEVE (só join docs+itens).
-- A versão anterior recalculava agg_plan/agg_rec/locs/mat em CADA página;
-- com 6 páginas em paralelo isso explodia para ~2 min.
-- Enriquecimento (recebido/locs/status/peso) fica no cliente (1× mapas leves).

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_export_documentos_itens_csv_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_off int;
  v_lim int;
  v_chunk text;
  v_n int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'chunk', '', 'n', 0, 'offset', v_off, 'limit', v_lim, 'total', -1,
      '_source', 'snapshot', '_format', 'base_v2'
    );
  END IF;

  WITH page AS (
    SELECT
      row_number() OVER () AS ord,
      d.id::text AS documento_id,
      i.id::text AS item_id,
      d.numero,
      coalesce(nullif(btrim(d.revisao), ''), 'A') AS revisao,
      coalesce(d.descricao, '') AS descricao_documento,
      coalesce(d.responsavel, '') AS responsavel,
      CASE WHEN d.data_documento IS NULL THEN '' ELSE to_char(d.data_documento::date, 'YYYY-MM-DD') END AS data_documento,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_documento,
      coalesce(i.codigo, '') AS codigo_material,
      coalesce(i.descricao, '') AS descricao_material,
      coalesce(nullif(btrim(i.unidade), ''), 'UN') AS unidade,
      coalesce(i.quantidade, 0) AS q_doc,
      coalesce(i.quantidade_atendida, 0) AS q_atd,
      coalesce(i.localizacao, '') AS localizacao_planejamento
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.id = i.documento_id AND d.tenant_id = i.tenant_id
    WHERE i.tenant_id = p_tenant_id
    ORDER BY d.numero, d.id, i.id
    OFFSET v_off
    LIMIT v_lim
  ),
  lined AS (
    SELECT
      ord,
      public.iso_pro_csv_cell(documento_id) || ';' ||
      public.iso_pro_csv_cell(item_id) || ';' ||
      public.iso_pro_csv_cell(numero) || ';' ||
      public.iso_pro_csv_cell(revisao) || ';' ||
      public.iso_pro_csv_cell(descricao_documento) || ';' ||
      public.iso_pro_csv_cell(responsavel) || ';' ||
      public.iso_pro_csv_cell(data_documento) || ';' ||
      public.iso_pro_csv_cell(status_documento) || ';' ||
      public.iso_pro_csv_cell(codigo_material) || ';' ||
      public.iso_pro_csv_cell(descricao_material) || ';' ||
      public.iso_pro_csv_cell(unidade) || ';' ||
      public.iso_pro_fmt_decimal_pt(q_doc) || ';' ||
      public.iso_pro_fmt_decimal_pt(q_atd) || ';' ||
      public.iso_pro_csv_cell(localizacao_planejamento)
      AS line
    FROM page
  )
  SELECT
    coalesce(string_agg(line, E'\n' ORDER BY ord), ''),
    count(*)::int
  INTO v_chunk, v_n
  FROM lined;

  RETURN jsonb_build_object(
    'chunk', coalesce(v_chunk, ''),
    'n', coalesce(v_n, 0),
    'offset', v_off,
    'limit', v_lim,
    'total', -1,
    '_source', 'tables',
    '_format', 'base_v2'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_export_documentos_itens_csv_page(uuid, int, int) IS
  'Export Excel: página CSV LEVE (base_v2) — só docs+itens; cliente enriquece.';

COMMIT;
