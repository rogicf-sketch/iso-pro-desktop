-- Status lista = detalhe, sem regressão de perf na baixa.
--
-- 1) status_derivado RÁPIDO (espelho de atendimento / write):
--    - todas linhas atendidas → atendido
--    - NÃO desce recebido→parcial só por qAt parcial
--    - com qAt≈0: calcula recebido/parcial/pendente via estoque
-- 2) Heal set-based + RPC de lote para corrigir coluna já errada
-- 3) Lista rápida continua a ler a COLUNA (sem derivado por linha)

BEGIN;

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
  v_eps numeric := 1e-9;
  v_linhas integer := 0;
  v_linhas_abertas integer := 0;
  v_proj numeric := 0;
  v_at numeric := 0;
  v_n_codes integer := 0;
  v_has_rec boolean := false;
  v_all_cobertos boolean := true;
  v_algum_parcial boolean := false;
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

  IF v_linhas = 0 THEN
    RETURN 'pendente';
  END IF;

  IF v_linhas_abertas = 0 OR (v_proj > 0 AND v_at + v_eps >= v_proj) THEN
    RETURN 'atendido';
  END IF;

  -- Detalhe: estoque coberto = Recebido mesmo com baixa parcial.
  -- Não descer Recebido→Parcial no espelho rápido da baixa.
  IF v_status = 'recebido' THEN
    RETURN 'recebido';
  END IF;

  -- Já houve baixa e a coluna não era recebido: caminho rápido (perf atendimento).
  -- Heal set-based / recalc por códigos corrige parcial→recebido quando o estoque cobre.
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
    bool_and(prevista_g <= 0 OR recebido_g + v_eps >= prevista_g),
    bool_or(recebido_g > v_eps AND prevista_g > 0 AND recebido_g + v_eps < prevista_g)
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

  IF v_n_codes = 0 OR NOT v_has_rec THEN
    RETURN 'pendente';
  END IF;

  IF v_all_cobertos AND NOT v_algum_parcial THEN
    RETURN 'recebido';
  END IF;

  RETURN 'parcial';
END;
$$;

COMMENT ON FUNCTION public.iso_pro_documento_status_derivado(uuid, text, text) IS
  'Status lista rápido: atendido | preserva recebido c/ qAt parcial | parcial se qAt>0 | recebido/parcial/pendente se qAt=0.';

-- Recalc set-based (parcial → derivado alinhado ao detalhe). Usado no heal e após NF.
CREATE OR REPLACE FUNCTION public.iso_pro_heal_status_documentos_planejamento(
  p_tenant_id uuid,
  p_limit int DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_atualizados int := 0;
  v_lim int;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  v_lim := LEAST(GREATEST(coalesce(p_limit, 500), 1), 5000);

  WITH alvo AS (
    SELECT d.id
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) = 'parcial'
    ORDER BY d.numero
    LIMIT v_lim
  ),
  prevista_cod AS (
    SELECT
      lower(btrim(coalesce(di.codigo, ''))) AS codigo,
      sum(di.quantidade) AS prevista
    FROM public.iso_pro_documento_itens_planejamento di
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = di.tenant_id AND d.id = di.documento_id
    WHERE di.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      AND lower(btrim(coalesce(di.codigo, ''))) <> ''
      AND EXISTS (
        SELECT 1 FROM public.iso_pro_documento_itens_planejamento x
        WHERE x.tenant_id = p_tenant_id
          AND x.documento_id IN (SELECT id FROM alvo)
          AND lower(btrim(coalesce(x.codigo, ''))) = lower(btrim(coalesce(di.codigo, '')))
      )
    GROUP BY 1
  ),
  recebido_cod AS (
    SELECT
      lower(btrim(coalesce(ri.codigo, ''))) AS codigo,
      sum(
        CASE
          WHEN lower(btrim(r.modo_recebimento)) = 'direto'
            THEN greatest(coalesce(ri.quantidade, 0), 0)
          WHEN ri.quantidade_conferida IS NOT NULL
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      ) AS recebido
    FROM public.iso_pro_recebimento_itens ri
    INNER JOIN public.iso_pro_recebimentos r
      ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
    WHERE ri.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
      AND (
        lower(btrim(r.modo_recebimento)) = 'direto'
        OR lower(btrim(r.status)) IN ('conferido', 'parcialmente_conferido', 'divergente')
      )
      AND lower(btrim(coalesce(ri.codigo, ''))) <> ''
      AND EXISTS (
        SELECT 1 FROM public.iso_pro_documento_itens_planejamento x
        WHERE x.tenant_id = p_tenant_id
          AND x.documento_id IN (SELECT id FROM alvo)
          AND lower(btrim(coalesce(x.codigo, ''))) = lower(btrim(coalesce(ri.codigo, '')))
      )
    GROUP BY 1
  ),
  linha_st AS (
    SELECT
      i.documento_id,
      CASE
        WHEN coalesce(i.quantidade, 0) > 0
          AND coalesce(i.quantidade_atendida, 0) + 1e-9 >= coalesce(i.quantidade, 0)
          THEN 'atendido'
        WHEN coalesce(rc.recebido, 0) <= 1e-9
          THEN 'pendente'
        WHEN coalesce(rc.recebido, 0) + 1e-9 < coalesce(pc.prevista, 0)
          THEN 'parcial'
        ELSE 'recebido'
      END AS st
    FROM public.iso_pro_documento_itens_planejamento i
    LEFT JOIN prevista_cod pc
      ON pc.codigo = lower(btrim(coalesce(i.codigo, '')))
    LEFT JOIN recebido_cod rc
      ON rc.codigo = lower(btrim(coalesce(i.codigo, '')))
    WHERE i.tenant_id = p_tenant_id
      AND i.documento_id IN (SELECT id FROM alvo)
  ),
  doc_novo AS (
    SELECT
      documento_id,
      CASE
        WHEN count(*) FILTER (WHERE st = 'atendido') = count(*) THEN 'atendido'
        WHEN count(*) FILTER (WHERE st IN ('recebido', 'atendido')) = count(*) THEN 'recebido'
        WHEN count(*) FILTER (WHERE st = 'pendente') = count(*) THEN 'pendente'
        ELSE 'parcial'
      END AS novo
    FROM linha_st
    GROUP BY documento_id
  )
  UPDATE public.iso_pro_documentos_planejamento d
  SET
    status = n.novo,
    updated_at = now()
  FROM doc_novo n
  WHERE d.tenant_id = p_tenant_id
    AND d.id = n.documento_id
    AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM n.novo;

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'atualizados', v_atualizados, 'lote', v_lim);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_heal_status_documentos_planejamento(uuid, int) IS
  'Heal set-based: parcial→recebido/atendido alinhado ao detalhe (sem N× status_derivado).';

-- Após NF: além do derivado rápido, heal set-based nos códigos tocados (parcial→recebido).
CREATE OR REPLACE FUNCTION public.iso_pro_recalcular_status_documentos_por_codigos(
  p_tenant_id uuid,
  p_codigos text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_codes text[];
  v_rapido int := 0;
  v_heal jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT coalesce(array_agg(DISTINCT lower(btrim(c))), ARRAY[]::text[])
  INTO v_codes
  FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) AS c
  WHERE btrim(coalesce(c, '')) <> '';

  IF coalesce(cardinality(v_codes), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'atualizados', 0, 'codigos', 0);
  END IF;

  UPDATE public.iso_pro_documentos_planejamento d
  SET
    status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status),
    updated_at = now()
  WHERE d.tenant_id = p_tenant_id
    AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
    AND EXISTS (
      SELECT 1
      FROM public.iso_pro_documento_itens_planejamento i
      WHERE i.tenant_id = d.tenant_id
        AND i.documento_id = d.id
        AND lower(btrim(coalesce(i.codigo, ''))) = ANY (v_codes)
    );

  GET DIAGNOSTICS v_rapido = ROW_COUNT;

  -- Corrige parcial que já tem estoque coberto (derivado rápido não sobe parcial→recebido c/ qAt>0).
  v_heal := public.iso_pro_heal_status_documentos_planejamento(p_tenant_id, 2000);

  RETURN jsonb_build_object(
    'ok', true,
    'atualizados', v_rapido,
    'codigos', cardinality(v_codes),
    'heal', v_heal
  );
END;
$$;

COMMIT;
