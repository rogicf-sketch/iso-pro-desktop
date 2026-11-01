-- Export CSV final com filtros (busca/status) no servidor — evita full-fetch + filtro no browser.

BEGIN;

DROP FUNCTION IF EXISTS public.iso_pro_export_documentos_itens_csv_all(uuid);

CREATE OR REPLACE FUNCTION public.iso_pro_export_documentos_itens_csv_all(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_status text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_chunk text;
  v_n int := 0;
  v_q text;
  v_status text;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_status := lower(btrim(coalesce(p_status, '')));
  IF v_status IN ('', 'todos', 'all') THEN
    v_status := NULL;
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'chunk', '', 'n', 0, '_source', 'snapshot', '_format', 'final_v1'
    );
  END IF;

  WITH
  agg_plan AS MATERIALIZED (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS k,
      sum(coalesce(i.quantidade, 0)) AS prevista,
      sum(coalesce(i.quantidade_atendida, 0)) AS atendido
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(i.codigo, ''))) <> ''
    GROUP BY 1
  ),
  agg_rec AS MATERIALIZED (
    SELECT c.codigo AS k, c.quantidade AS recebido
    FROM public.iso_pro_qty_recebida_por_codigo c
    WHERE c.tenant_id = p_tenant_id
    UNION ALL
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS k,
      sum(
        CASE
          WHEN lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
            THEN coalesce(ri.quantidade, 0)
          ELSE coalesce(ri.quantidade_conferida, 0)
        END
      ) AS recebido
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND NOT EXISTS (
        SELECT 1 FROM public.iso_pro_qty_recebida_por_codigo c
        WHERE c.tenant_id = p_tenant_id
        LIMIT 1
      )
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
  locs AS MATERIALIZED (
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS k,
      string_agg(DISTINCT btrim(ri.localizacao), ' | ' ORDER BY btrim(ri.localizacao)) AS locs
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
      AND btrim(coalesce(ri.localizacao, '')) <> ''
      AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
      AND (
        lower(btrim(coalesce(r.modo_recebimento, 'direto'))) = 'direto'
        OR lower(btrim(coalesce(r.status, ''))) IN (
          'conferido', 'parcialmente_conferido', 'divergente'
        )
      )
    GROUP BY 1
  ),
  mat AS MATERIALIZED (
    SELECT
      lower(btrim(m.codigo)) AS k,
      coalesce(m.peso, 0)::numeric AS peso,
      coalesce(m.disciplina, '') AS disciplina
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id
  ),
  base AS (
    SELECT
      row_number() OVER (ORDER BY d.numero, d.id, i.id) AS ord,
      d.numero,
      coalesce(nullif(btrim(d.revisao), ''), 'A') AS revisao,
      coalesce(d.descricao, '') AS descricao_documento,
      coalesce(d.responsavel, '') AS responsavel,
      CASE WHEN d.data_documento IS NULL THEN '' ELSE to_char(d.data_documento::date, 'YYYY-MM-DD') END AS data_documento,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_documento,
      coalesce(i.codigo, '') AS codigo_material,
      coalesce(i.descricao, '') AS descricao_material,
      coalesce(i.localizacao, '') AS localizacao_planejamento,
      coalesce(nullif(btrim(i.unidade), ''), 'UN') AS unidade,
      coalesce(i.quantidade, 0)::numeric AS q_doc,
      coalesce(i.quantidade_atendida, 0)::numeric AS q_atd,
      lower(btrim(coalesce(i.codigo, ''))) AS k
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.id = i.documento_id AND d.tenant_id = i.tenant_id
    WHERE i.tenant_id = p_tenant_id
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
  ),
  enriched AS (
    SELECT
      b.*,
      coalesce(m.peso, 0) AS peso_un,
      coalesce(m.disciplina, '') AS disciplina,
      coalesce(ap.prevista, 0) AS prevista,
      coalesce(ap.atendido, 0) AS atendido_glob,
      coalesce(ar.recebido, 0) AS recebido,
      coalesce(nullif(btrim(l.locs), ''), b.localizacao_planejamento) AS loc_consol
    FROM base b
    LEFT JOIN mat m ON m.k = b.k
    LEFT JOIN agg_plan ap ON ap.k = b.k
    LEFT JOIN agg_rec ar ON ar.k = b.k
    LEFT JOIN locs l ON l.k = b.k
  ),
  lined AS (
    SELECT
      ord,
      public.iso_pro_csv_cell(numero) || ';' ||
      public.iso_pro_csv_cell(revisao) || ';' ||
      public.iso_pro_csv_cell(descricao_documento) || ';' ||
      public.iso_pro_csv_cell(responsavel) || ';' ||
      public.iso_pro_csv_cell(data_documento) || ';' ||
      public.iso_pro_csv_cell(status_documento) || ';' ||
      public.iso_pro_csv_cell(codigo_material) || ';' ||
      public.iso_pro_csv_cell(descricao_material) || ';' ||
      public.iso_pro_csv_cell(localizacao_planejamento) || ';' ||
      public.iso_pro_csv_cell(loc_consol) || ';' ||
      public.iso_pro_csv_cell(disciplina) || ';' ||
      public.iso_pro_csv_cell(unidade) || ';' ||
      public.iso_pro_fmt_decimal_pt(q_doc) || ';' ||
      public.iso_pro_fmt_decimal_pt(q_atd) || ';' ||
      public.iso_pro_fmt_decimal_pt(GREATEST(q_doc - q_atd, 0)) || ';' ||
      public.iso_pro_fmt_decimal_pt(prevista) || ';' ||
      public.iso_pro_fmt_decimal_pt(atendido_glob) || ';' ||
      public.iso_pro_fmt_decimal_pt(recebido) || ';' ||
      public.iso_pro_csv_cell(
        CASE
          WHEN q_doc > 0 AND q_atd + 1e-9 >= q_doc THEN 'Atendido'
          WHEN recebido <= 0 THEN 'Pendente'
          WHEN recebido + 1e-9 < prevista THEN 'Parcial'
          WHEN atendido_glob + 1e-9 < prevista THEN 'Recebido'
          WHEN q_atd + 1e-9 < q_doc THEN 'Recebido'
          WHEN prevista > 0 AND atendido_glob + 1e-9 >= prevista THEN 'Atendido'
          WHEN prevista > 0 AND recebido + 1e-9 >= prevista THEN 'Recebido'
          WHEN recebido > 0 THEN 'Parcial'
          ELSE 'Pendente'
        END
      ) || ';' ||
      public.iso_pro_fmt_decimal_pt(peso_un) || ';' ||
      public.iso_pro_fmt_decimal_pt(round((q_doc * peso_un)::numeric, 6)) || ';' ||
      public.iso_pro_fmt_decimal_pt(round((q_atd * peso_un)::numeric, 6)) || ';' ||
      public.iso_pro_fmt_decimal_pt(GREATEST(recebido - atendido_glob, 0))
      AS line
    FROM enriched
  )
  SELECT
    coalesce(string_agg(line, E'\n' ORDER BY ord), ''),
    count(*)::int
  INTO v_chunk, v_n
  FROM lined;

  RETURN jsonb_build_object(
    'chunk', coalesce(v_chunk, ''),
    'n', coalesce(v_n, 0),
    '_source', 'tables',
    '_format', 'final_v1'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_export_documentos_itens_csv_all(uuid, text, text) IS
  'Export Excel planejamento: CSV final (aggs 1×) com filtros opcionais busca/status.';

REVOKE ALL ON FUNCTION public.iso_pro_export_documentos_itens_csv_all(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_documentos_itens_csv_all(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_documentos_itens_csv_all(uuid, text, text) TO authenticated;

COMMIT;
