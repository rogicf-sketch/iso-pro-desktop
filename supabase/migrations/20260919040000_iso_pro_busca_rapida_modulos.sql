-- Busca rápida transversal: helper LIKE escape + materiais/recebimentos/pendentes atendimento.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_like_escape(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(replace(replace(coalesce(p, ''), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
$$;

COMMENT ON FUNCTION public.iso_pro_like_escape(text) IS
  'Escapa \\, % e _ para uso em LIKE ... ESCAPE ''\\'' (códigos com underscore).';

REVOKE ALL ON FUNCTION public.iso_pro_like_escape(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_like_escape(text) TO anon, authenticated;

-- ---------- Materiais ----------
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
  v_like text;
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
  v_like := public.iso_pro_like_escape(v_q);
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
        OR lower(btrim(coalesce(m.codigo, ''))) = v_q
        OR lower(btrim(coalesce(m.codigo, ''))) LIKE v_q || '%'
        OR lower(btrim(coalesce(m.codigo, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(coalesce(m.codigo_barras, ''))) = v_q
        OR lower(btrim(coalesce(m.codigo_barras, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(coalesce(m.descricao, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(coalesce(m.disciplina, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
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
        ORDER BY
          CASE
            WHEN v_q <> '' AND lower(btrim(coalesce(p.codigo, ''))) = v_q THEN 0
            WHEN v_q <> '' AND lower(btrim(coalesce(p.codigo, ''))) LIKE v_q || '%' THEN 1
            ELSE 2
          END,
          lower(btrim(p.codigo)),
          p.id
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
            OR lower(btrim(coalesce(m.codigo, ''))) = v_q
            OR lower(btrim(coalesce(m.codigo, ''))) LIKE v_q || '%'
            OR lower(btrim(coalesce(m.codigo, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
            OR lower(btrim(coalesce(m.codigo_barras, ''))) = v_q
            OR lower(btrim(coalesce(m.codigo_barras, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
            OR lower(btrim(coalesce(m.descricao, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
            OR lower(btrim(coalesce(m.disciplina, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
          )
        ORDER BY
          CASE
            WHEN v_q <> '' AND lower(btrim(coalesce(m.codigo, ''))) = v_q THEN 0
            WHEN v_q <> '' AND lower(btrim(coalesce(m.codigo, ''))) LIKE v_q || '%' THEN 1
            ELSE 2
          END,
          lower(btrim(m.codigo)),
          m.id
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

-- ---------- Recebimentos ----------
CREATE OR REPLACE FUNCTION public.iso_pro_list_recebimentos_page(
  p_tenant_id uuid,
  p_busca text DEFAULT NULL,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 50,
  p_status text DEFAULT NULL,
  p_modo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_q text;
  v_like text;
  v_off int;
  v_lim int;
  v_status text;
  v_modo text;
  v_total int := 0;
  v_rows jsonb;
  v_filtros boolean := false;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_like := public.iso_pro_like_escape(v_q);
  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_status := lower(btrim(coalesce(p_status, '')));
  v_modo := lower(btrim(coalesce(p_modo, '')));
  IF v_status IN ('', 'todos', 'all') THEN v_status := NULL; END IF;
  IF v_modo IN ('', 'todos', 'all') THEN v_modo := NULL; END IF;
  v_filtros := (v_q <> '' OR v_status IS NOT NULL OR v_modo IS NOT NULL);

  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'recebimentos', '[]'::jsonb,
      'total', 0,
      'offset', v_off,
      'limit', v_lim,
      '_source', 'snapshot',
      '_hint', 'Execute iso_pro_sync_recebimentos_from_snapshot para activar tabelas.'
    );
  END IF;

  IF NOT v_filtros THEN
    SELECT c.recebimentos::int INTO v_total
    FROM public.iso_pro_tenant_contagens c
    WHERE c.tenant_id = p_tenant_id;
    IF v_total IS NULL THEN
      SELECT count(*)::int INTO v_total
      FROM public.iso_pro_recebimentos r
      WHERE r.tenant_id = p_tenant_id;
    END IF;
  ELSE
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (v_modo IS NULL OR lower(btrim(r.modo_recebimento)) = v_modo)
      AND (
        v_q = ''
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(r.nota_fiscal)) = v_q
        OR lower(btrim(r.nota_fiscal)) LIKE v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(r.romaneio)) = v_q
        OR lower(btrim(r.romaneio)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(r.conferente)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) = v_q
              OR lower(btrim(coalesce(ix.codigo, ''))) LIKE v_q || '%'
              OR lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
            )
        )
      );
  END IF;

  WITH pagina AS (
    SELECT
      r.id,
      r.fornecedor,
      r.data_recebimento,
      r.nota_fiscal,
      r.romaneio,
      r.conferente,
      r.modo_recebimento,
      r.status,
      r.data_conferencia
    FROM public.iso_pro_recebimentos r
    WHERE r.tenant_id = p_tenant_id
      AND (v_status IS NULL OR lower(btrim(r.status)) = v_status)
      AND (v_modo IS NULL OR lower(btrim(r.modo_recebimento)) = v_modo)
      AND (
        v_q = ''
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(r.nota_fiscal)) = v_q
        OR lower(btrim(r.nota_fiscal)) LIKE v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(r.romaneio)) = v_q
        OR lower(btrim(r.romaneio)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(btrim(r.conferente)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) = v_q
              OR lower(btrim(coalesce(ix.codigo, ''))) LIKE v_q || '%'
              OR lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_like || '%' ESCAPE E'\\'
            )
        )
      )
    ORDER BY r.data_recebimento DESC NULLS LAST, lower(btrim(r.nota_fiscal)), r.id
    OFFSET v_off
    LIMIT v_lim
  ),
  agg AS (
    SELECT
      i.recebimento_id,
      count(*)::int AS total_itens,
      coalesce(sum(i.quantidade), 0) AS qtd_recebida,
      coalesce(sum(i.quantidade_conferida), 0) AS qtd_conferida,
      coalesce(sum(
        CASE
          WHEN coalesce(i.quantidade, 0) > 0
            AND coalesce(i.quantidade_conferida, 0) < coalesce(i.quantidade, 0)
          THEN 1 ELSE 0
        END
      ), 0)::int AS divergentes
    FROM public.iso_pro_recebimento_itens i
    WHERE i.tenant_id = p_tenant_id
      AND i.recebimento_id IN (SELECT p.id FROM pagina p)
    GROUP BY i.recebimento_id
  )
  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'fornecedor', p.fornecedor,
          'dataRecebimento', to_char(p.data_recebimento, 'YYYY-MM-DD'),
          'notaFiscal', p.nota_fiscal,
          'romaneio', p.romaneio,
          'conferente', p.conferente,
          'modoRecebimento', p.modo_recebimento,
          'status', p.status,
          'dataConferencia', CASE
            WHEN p.data_conferencia IS NULL THEN NULL
            ELSE to_char(p.data_conferencia AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          END,
          'totalItens', coalesce(a.total_itens, 0),
          'quantidadeRecebidaTotal', coalesce(a.qtd_recebida, 0),
          'quantidadeConferidaTotal', coalesce(a.qtd_conferida, 0),
          'conferenciaItensDivergentes',
            CASE
              WHEN lower(btrim(coalesce(p.modo_recebimento, ''))) = 'direto'
                AND p.data_conferencia IS NULL
              THEN 0
              ELSE coalesce(a.divergentes, 0)
            END
        )
        ORDER BY p.data_recebimento DESC NULLS LAST, lower(btrim(p.nota_fiscal)), p.id
      )
      FROM pagina p
      LEFT JOIN agg a ON a.recebimento_id = p.id
    ),
    '[]'::jsonb
  )
  INTO v_rows;

  RETURN jsonb_build_object(
    'recebimentos', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables',
    '_totalMode', CASE WHEN v_filtros THEN 'exact' ELSE 'cached' END
  );
END;
$$;

-- ---------- Pendentes Atendimento (busca desenho) ----------
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
  v_like text;
  v_lim int;
  v_docs jsonb;
  v_total int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_q := lower(btrim(coalesce(p_busca, '')));
  v_like := public.iso_pro_like_escape(v_q);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 2000), 1), 200);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'documentos', '[]'::jsonb,
      'total', 0,
      '_source', 'snapshot',
      '_hint', 'Tabelas de documentos inactivas.'
    );
  END IF;

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
        OR lower(btrim(d.numero)) = v_q
        OR lower(btrim(d.numero)) LIKE v_q || '%'
        OR lower(btrim(d.numero)) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(coalesce(d.descricao, '')) LIKE '%' || v_like || '%' ESCAPE E'\\'
        OR lower(coalesce(d.revisao, '')) LIKE '%' || v_like || '%' ESCAPE E'\\'
      )
      AND EXISTS (
        SELECT 1
        FROM public.iso_pro_documento_itens_planejamento i
        WHERE i.tenant_id = d.tenant_id
          AND i.documento_id = d.id
          AND coalesce(i.quantidade, 0) > coalesce(i.quantidade_atendida, 0) + 1e-9
      )
    ORDER BY
      CASE
        WHEN v_q <> '' AND lower(btrim(d.numero)) = v_q THEN 0
        WHEN v_q <> '' AND lower(btrim(d.numero)) LIKE v_q || '%' THEN 1
        ELSE 2
      END,
      d.numero
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

COMMENT ON FUNCTION public.iso_pro_list_materiais_page(uuid, text, int, int, text, text) IS
  'Lista materiais paginada; busca escapa _/% e prioriza igualdade/prefixo no código.';
COMMENT ON FUNCTION public.iso_pro_list_recebimentos_page(uuid, text, int, int, text, text) IS
  'Lista recebimentos paginada; busca escapa _/% (NF, romaneio, códigos de item).';
COMMENT ON FUNCTION public.iso_pro_list_documentos_pendentes_atendimento(uuid, text, int) IS
  'Pendentes Atendimento; busca escapa _/% e prioriza igualdade/prefixo no número.';

COMMIT;
