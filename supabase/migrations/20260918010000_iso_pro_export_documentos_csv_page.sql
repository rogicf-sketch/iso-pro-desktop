-- Export planejamento: páginas em CSV texto (em vez de JSON gordo ~2.8MB/página).
-- Inclui peso/disciplina, recebido, localização e status já calculados.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_fmt_decimal_pt(p numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  IF p IS NULL OR p = 0 THEN
    RETURN '0';
  END IF;
  s := trim(trailing '0' from trim(trailing '.' from round(p, 6)::text));
  IF s IS NULL OR s = '' OR s = '-' THEN
    RETURN '0';
  END IF;
  RETURN replace(s, '.', ',');
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_fmt_decimal_pt(p double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.iso_pro_fmt_decimal_pt(p::numeric);
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_csv_cell(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN ''
    WHEN p ~ '[;\r\n"]' THEN '"' || replace(p, '"', '""') || '"'
    ELSE p
  END;
$$;

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
SET statement_timeout = '120s'
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
      'chunk', '', 'n', 0, 'offset', v_off, 'limit', v_lim, 'total', 0, '_source', 'snapshot'
    );
  END IF;

  WITH
  agg_plan AS (
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS k,
      sum(coalesce(i.quantidade, 0)) AS prevista,
      sum(coalesce(i.quantidade_atendida, 0)) AS atendido
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(i.codigo, ''))) <> ''
    GROUP BY 1
  ),
  agg_rec AS (
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
  locs AS (
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
  mat AS (
    SELECT
      lower(btrim(m.codigo)) AS k,
      coalesce(m.peso, 0) AS peso,
      coalesce(m.disciplina, '') AS disciplina
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id
  ),
  page AS (
    SELECT
      row_number() OVER () AS ord,
      s.numero,
      s.revisao,
      s.descricao_documento,
      s.responsavel,
      s.data_documento,
      s.status_documento,
      s.codigo_material,
      s.descricao_material,
      s.localizacao_planejamento,
      s.unidade,
      s.q_doc,
      s.q_atd,
      s.k
    FROM (
      SELECT
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
        coalesce(i.quantidade, 0) AS q_doc,
        coalesce(i.quantidade_atendida, 0) AS q_atd,
        lower(btrim(coalesce(i.codigo, ''))) AS k
      FROM public.iso_pro_documento_itens_planejamento i
      INNER JOIN public.iso_pro_documentos_planejamento d
        ON d.id = i.documento_id AND d.tenant_id = i.tenant_id
      WHERE i.tenant_id = p_tenant_id
      ORDER BY d.numero, d.id, i.id
      OFFSET v_off
      LIMIT v_lim
    ) s
  ),
  enriched AS (
    SELECT
      p.*,
      coalesce(m.peso, 0) AS peso_un,
      coalesce(m.disciplina, '') AS disciplina,
      coalesce(ap.prevista, 0) AS prevista,
      coalesce(ap.atendido, 0) AS atendido_glob,
      coalesce(ar.recebido, 0) AS recebido,
      coalesce(nullif(btrim(l.locs), ''), p.localizacao_planejamento) AS loc_consol
    FROM page p
    LEFT JOIN mat m ON m.k = p.k
    LEFT JOIN agg_plan ap ON ap.k = p.k
    LEFT JOIN agg_rec ar ON ar.k = p.k
    LEFT JOIN locs l ON l.k = p.k
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
    'offset', v_off,
    'limit', v_lim,
    'total', -1,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_export_documentos_itens_csv_page(uuid, int, int) IS
  'Export Excel: página CSV texto (até 5000 linhas) com peso/recebido/localização/status.';

REVOKE ALL ON FUNCTION public.iso_pro_fmt_decimal_pt(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_fmt_decimal_pt(double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_csv_cell(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_documentos_itens_csv_page(uuid, int, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.iso_pro_fmt_decimal_pt(numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_fmt_decimal_pt(double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_csv_cell(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_documentos_itens_csv_page(uuid, int, int) TO anon, authenticated;

COMMIT;
