-- Planejamento: lista principal alinhada ao detalhe quando todas as linhas estão atendidas.
-- Causa: lista rápida lia só a coluna status (podia ficar em recebido/parcial após baixas).
-- Detalhe/folha já usam qAtendida>=qProjeto por linha → Atendido.
--
-- 1) Heal da coluna status (todas as linhas cobertas)
-- 2) Lista: se sum(qAt) >= sum(qProj) → devolve 'atendido' (barato, só na página)
-- 3) status_derivado: prioriza «todas as linhas atendidas» (igual ao cliente)

BEGIN;

-- 1) Heal one-shot (idempotente)
UPDATE public.iso_pro_documentos_planejamento d
SET
  status = 'atendido',
  updated_at = now()
WHERE lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
  AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'atendido'
  AND EXISTS (
    SELECT 1
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = d.tenant_id AND i.documento_id = d.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = d.tenant_id
      AND i.documento_id = d.id
      AND coalesce(i.quantidade, 0) > 0
      AND coalesce(i.quantidade_atendida, 0) + 1e-9 < coalesce(i.quantidade, 0)
  );

-- 2) status_derivado: linhas todas atendidas → atendido (antes de parcial/recebido)
CREATE OR REPLACE FUNCTION public.iso_pro_documento_status_derivado(
  p_tenant_id uuid,
  p_doc_id text,
  p_status_col text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_proj numeric;
  v_at numeric;
  v_has_rec boolean := false;
  v_all_cobertos boolean := true;
  v_algum_parcial boolean := false;
  v_n_codes integer := 0;
  v_eps numeric := 1e-9;
  v_linhas integer := 0;
  v_linhas_abertas integer := 0;
BEGIN
  v_status := lower(btrim(coalesce(p_status_col, '')));
  IF v_status = 'cancelado' THEN
    RETURN 'cancelado';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE coalesce(i.quantidade, 0) > 0
        AND coalesce(i.quantidade_atendida, 0) + v_eps < coalesce(i.quantidade, 0)
    )::int,
    coalesce(sum(i.quantidade), 0),
    coalesce(sum(i.quantidade_atendida), 0)
  INTO v_linhas, v_linhas_abertas, v_proj, v_at
  FROM public.iso_pro_documento_itens_planejamento i
  WHERE i.tenant_id = p_tenant_id AND i.documento_id = p_doc_id;

  IF v_linhas > 0 AND v_linhas_abertas = 0 THEN
    RETURN 'atendido';
  END IF;

  IF v_proj <= 0 THEN
    IF v_status IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado') THEN
      RETURN v_status;
    END IF;
    RETURN 'pendente';
  END IF;

  IF v_at >= v_proj - v_eps THEN
    RETURN 'atendido';
  END IF;

  -- Já houve baixa neste documento: status operacional é parcial.
  IF v_at > v_eps THEN
    RETURN 'parcial';
  END IF;

  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    IF v_status IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado') THEN
      RETURN v_status;
    END IF;
    RETURN 'pendente';
  END IF;

  SELECT
    count(*)::int,
    bool_or(recebido_g > v_eps),
    bool_and(recebido_g + v_eps >= prevista_g AND prevista_g > 0),
    bool_or(recebido_g > v_eps AND recebido_g + v_eps < prevista_g)
  INTO v_n_codes, v_has_rec, v_all_cobertos, v_algum_parcial
  FROM (
    SELECT
      dc.codigo,
      coalesce(gp.prevista, 0) AS prevista_g,
      coalesce(gr.recebido, 0) AS recebido_g
    FROM (
      SELECT lower(btrim(coalesce(i.codigo, ''))) AS codigo
      FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = p_tenant_id AND i.documento_id = p_doc_id
        AND lower(btrim(coalesce(i.codigo, ''))) <> ''
      GROUP BY 1
    ) dc
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(di.quantidade), 0) AS prevista
      FROM public.iso_pro_documento_itens_planejamento di
      INNER JOIN public.iso_pro_documentos_planejamento d
        ON d.tenant_id = di.tenant_id AND d.id = di.documento_id
      WHERE di.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(di.codigo, ''))) = dc.codigo
        AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
    ) gp ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(
        CASE
          WHEN lower(btrim(r.modo_recebimento)) = 'direto'
            THEN greatest(coalesce(ri.quantidade, 0), 0)
          WHEN ri.quantidade_conferida IS NOT NULL
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      ), 0) AS recebido
      FROM public.iso_pro_recebimento_itens ri
      INNER JOIN public.iso_pro_recebimentos r
        ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
      WHERE ri.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(ri.codigo, ''))) = dc.codigo
        AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
        AND (
          lower(btrim(r.modo_recebimento)) = 'direto'
          OR lower(btrim(r.status)) IN ('conferido', 'parcialmente_conferido', 'divergente')
        )
    ) gr ON true
  ) m;

  IF v_n_codes = 0 THEN
    RETURN 'pendente';
  END IF;

  IF NOT v_has_rec THEN
    RETURN 'pendente';
  END IF;

  IF v_all_cobertos THEN
    RETURN 'recebido';
  END IF;

  IF v_algum_parcial OR v_has_rec THEN
    RETURN 'parcial';
  END IF;

  RETURN 'pendente';
END;
$$;

COMMENT ON FUNCTION public.iso_pro_documento_status_derivado(uuid, text, text) IS
  'Status planejamento: cancelado | todas linhas atendidas→atendido | soma qAt | senao recebido/parcial/pendente.';

-- 3) Lista: override barato na página (sem status_derivado pesado)
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
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_lista
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
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_planejamento_page(uuid, text, int, int, text) IS
  'Lista paginada; se qAt>=qProj devolve atendido (alinha detalhe). Coluna status healada em migração.';

COMMIT;
