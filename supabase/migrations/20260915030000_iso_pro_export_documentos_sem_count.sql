-- Export Documentos: sem COUNT na 1.ª página (poupa ~2–3s); total=-1 → cliente pagina por ondas.
CREATE OR REPLACE FUNCTION public.iso_pro_export_documentos_itens_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_off int;
  v_lim int;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'snapshot'
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'documento_id', s.documento_id,
        'numero', s.numero,
        'revisao', s.revisao,
        'descricao_documento', s.descricao_documento,
        'responsavel', s.responsavel,
        'data_documento', s.data_documento,
        'status_documento', s.status_documento,
        'item_id', s.item_id,
        'codigo_material', s.codigo_material,
        'descricao_material', s.descricao_material,
        'unidade', s.unidade,
        'quantidade_documento', s.quantidade_documento,
        'quantidade_atendida', s.quantidade_atendida,
        'localizacao_planejamento', s.localizacao_planejamento
      )
      ORDER BY s.numero, s.documento_id, s.item_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      d.id::text AS documento_id,
      d.numero,
      coalesce(nullif(btrim(d.revisao), ''), 'A') AS revisao,
      coalesce(d.descricao, '') AS descricao_documento,
      coalesce(d.responsavel, '') AS responsavel,
      CASE WHEN d.data_documento IS NULL THEN NULL ELSE to_char(d.data_documento::date, 'YYYY-MM-DD') END AS data_documento,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_documento,
      i.id::text AS item_id,
      coalesce(i.codigo, '') AS codigo_material,
      coalesce(i.descricao, '') AS descricao_material,
      coalesce(nullif(btrim(i.unidade), ''), 'UN') AS unidade,
      coalesce(i.quantidade, 0) AS quantidade_documento,
      coalesce(i.quantidade_atendida, 0) AS quantidade_atendida,
      coalesce(i.localizacao, '') AS localizacao_planejamento
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.id = i.documento_id AND d.tenant_id = i.tenant_id
    WHERE i.tenant_id = p_tenant_id
    ORDER BY d.numero, d.id, i.id
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', -1,
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_export_documentos_itens_page(uuid, int, int) IS
  'Export Excel/CSV documentos: página até 5000 itens; total=-1 (cliente usa ondas paralelas).';

REVOKE ALL ON FUNCTION public.iso_pro_export_documentos_itens_page(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_documentos_itens_page(uuid, int, int) TO anon, authenticated;
