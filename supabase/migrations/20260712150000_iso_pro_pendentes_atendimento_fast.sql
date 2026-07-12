-- Pendentes Atendimento: sem status_derivado; agregação directa (mais rápido no boot).

BEGIN;

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
  v_lim := LEAST(GREATEST(coalesce(p_limit, 2000), 1), 5000);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'documentos', '[]'::jsonb,
      'total', 0,
      '_source', 'snapshot',
      '_hint', 'Tabelas de documentos inactivas.'
    );
  END IF;

  SELECT count(DISTINCT d.id)::int INTO v_total
  FROM public.iso_pro_documentos_planejamento d
  INNER JOIN public.iso_pro_documento_itens_planejamento i
    ON i.tenant_id = d.tenant_id AND i.documento_id = d.id
  WHERE d.tenant_id = p_tenant_id
    AND lower(btrim(coalesce(d.status, ''))) <> 'cancelado'
    AND coalesce(i.quantidade, 0) > coalesce(i.quantidade_atendida, 0) + 1e-9
    AND (
      v_q = ''
      OR lower(btrim(d.numero)) LIKE '%' || v_q || '%'
      OR lower(btrim(coalesce(d.descricao, ''))) LIKE '%' || v_q || '%'
      OR lower(btrim(coalesce(d.revisao, ''))) LIKE '%' || v_q || '%'
    );

  WITH page AS (
    SELECT DISTINCT ON (lower(btrim(d.numero)), lower(btrim(d.revisao)), d.id)
      d.id,
      d.numero,
      d.revisao,
      d.descricao,
      d.responsavel,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_col
    FROM public.iso_pro_documentos_planejamento d
    INNER JOIN public.iso_pro_documento_itens_planejamento i
      ON i.tenant_id = d.tenant_id AND i.documento_id = d.id
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) <> 'cancelado'
      AND coalesce(i.quantidade, 0) > coalesce(i.quantidade_atendida, 0) + 1e-9
      AND (
        v_q = ''
        OR lower(btrim(d.numero)) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(d.descricao, ''))) LIKE '%' || v_q || '%'
        OR lower(btrim(coalesce(d.revisao, ''))) LIKE '%' || v_q || '%'
      )
    ORDER BY lower(btrim(d.numero)), lower(btrim(d.revisao)), d.id
    LIMIT v_lim
  )
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'numero', p.numero,
          'revisao', p.revisao,
          'descricao', coalesce(p.descricao, ''),
          'responsavel', coalesce(p.responsavel, ''),
          'status', p.status_col,
          'itens', coalesce(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', i.id,
                  'codigo', coalesce(i.codigo, ''),
                  'descricao', coalesce(i.descricao, ''),
                  'unidade', coalesce(i.unidade, 'UN'),
                  'quantidade', i.quantidade,
                  'quantidadeAtendida', i.quantidade_atendida
                )
                ORDER BY lower(btrim(coalesce(i.codigo, ''))), i.id
              )
              FROM public.iso_pro_documento_itens_planejamento i
              WHERE i.tenant_id = p_tenant_id
                AND i.documento_id = p.id
                AND coalesce(i.quantidade, 0) > coalesce(i.quantidade_atendida, 0) + 1e-9
            ),
            '[]'::jsonb
          )
        )
        ORDER BY lower(btrim(p.numero)), lower(btrim(p.revisao))
      )
      FROM page p
    ),
    '[]'::jsonb
  )
  INTO v_docs;

  RETURN jsonb_build_object(
    'documentos', coalesce(v_docs, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'limit', v_lim,
    'truncated', coalesce(v_total, 0) > v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(uuid, text, int) IS
  'Pendentes Atendimento: página limitada, status da coluna, sem status_derivado.';

COMMIT;
