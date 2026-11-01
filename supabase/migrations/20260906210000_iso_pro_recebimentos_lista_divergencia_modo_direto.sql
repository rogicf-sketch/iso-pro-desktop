-- Corrige falso positivo «N linha(s) com divergência» em recebimentos modo direto.
-- A lista rápida (20260906020000) passou a devolver sempre o count q_conf < q_nf,
-- mas no modo direto «puro» (sem data_conferencia) nao ha fluxo de conferencia —
-- quantidade_conferida fica 0 e TODAS as linhas apareciam como divergentes.
-- Alinha com a regra do cliente (toListItem) e com a RPC antiga.

BEGIN;

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
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.romaneio)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.conferente)) LIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_q || '%'
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
        OR lower(btrim(r.fornecedor)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.nota_fiscal)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.romaneio)) LIKE '%' || v_q || '%'
        OR lower(btrim(r.conferente)) LIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.iso_pro_recebimento_itens ix
          WHERE ix.tenant_id = r.tenant_id
            AND ix.recebimento_id = r.id
            AND (
              lower(btrim(coalesce(ix.codigo, ''))) LIKE '%' || v_q || '%'
              OR lower(btrim(coalesce(ix.descricao, ''))) LIKE '%' || v_q || '%'
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

COMMENT ON FUNCTION public.iso_pro_list_recebimentos_page(uuid, text, int, int, text, text) IS
  'Lista paginada enterprise: total cacheado sem filtro; divergencia so em fluxo de conferencia.';

COMMIT;
