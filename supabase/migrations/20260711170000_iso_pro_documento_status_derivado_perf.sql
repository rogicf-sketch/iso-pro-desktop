-- Performance: iso_pro_documento_status_derivado set-based (evita timeout na lista 11k).
-- Mantém a mesma língua: atendido / recebido / parcial / pendente.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_documento_status_derivado(
  p_tenant_id uuid,
  p_doc_id text,
  p_status_col text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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
BEGIN
  v_status := lower(btrim(coalesce(p_status_col, '')));
  IF v_status = 'cancelado' THEN
    RETURN 'cancelado';
  END IF;

  SELECT
    coalesce(sum(i.quantidade), 0),
    coalesce(sum(i.quantidade_atendida), 0)
  INTO v_proj, v_at
  FROM public.iso_pro_documento_itens_planejamento i
  WHERE i.tenant_id = p_tenant_id AND i.documento_id = p_doc_id;

  IF v_proj <= 0 THEN
    IF v_status IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado') THEN
      RETURN v_status;
    END IF;
    RETURN 'pendente';
  END IF;

  IF v_at >= v_proj - v_eps THEN
    RETURN 'atendido';
  END IF;

  -- Sem tabelas de recebimento: atendimento + coluna
  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    IF v_at > v_eps THEN
      RETURN 'parcial';
    END IF;
    IF v_status IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado') THEN
      RETURN v_status;
    END IF;
    RETURN 'pendente';
  END IF;

  -- Por código deste documento: cobertura global (1 query, não loop N×M)
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

  -- Já houve baixa parcial neste documento
  IF v_at > v_eps THEN
    RETURN 'parcial';
  END IF;

  IF v_all_cobertos AND v_has_rec THEN
    RETURN 'recebido';
  END IF;

  IF v_algum_parcial OR (v_has_rec AND NOT v_all_cobertos) THEN
    RETURN 'parcial';
  END IF;

  IF NOT v_has_rec THEN
    RETURN 'pendente';
  END IF;

  RETURN 'parcial';
END;
$$;

COMMENT ON FUNCTION public.iso_pro_documento_status_derivado(uuid, text, text) IS
  'Status documento (atendido/recebido/parcial/pendente) set-based — seguro para lista paginada.';

COMMIT;
