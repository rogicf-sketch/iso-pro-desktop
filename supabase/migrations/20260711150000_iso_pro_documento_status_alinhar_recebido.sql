-- Alinha status da lista de Planejamento com Visualizar/folha
-- (recebido = estoque cobre o projeto; atendido = baixas; pendente = sem recebimento).
-- Antes: iso_pro_documento_status_derivado só olhava quantidade_atendida → lista "Pendente"
-- enquanto Visualizar mostrava "Recebido" via resolverStatusLinhaDocumento.

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
  v_tem_linha boolean := false;
  v_all_atendido boolean := true;
  v_all_pendente boolean := true;
  v_all_recebido_ou_atendido boolean := true;
  v_linha record;
  v_cod text;
  v_prevista_g numeric;
  v_recebido_g numeric;
  v_atendido_g numeric;
  v_st_linha text;
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

  -- Atalho: documento totalmente baixado
  IF v_at >= v_proj - v_eps THEN
    RETURN 'atendido';
  END IF;

  -- Sem tabelas de recebimento: manter lógica antiga (atendimento + coluna)
  IF NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    IF v_at > v_eps THEN
      RETURN 'parcial';
    END IF;
    IF v_status IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado') THEN
      RETURN v_status;
    END IF;
    RETURN 'pendente';
  END IF;

  -- Por linha: mesma língua que documentoPlanejamento.resolverStatusLinhaDocumento
  FOR v_linha IN
    SELECT
      lower(btrim(coalesce(i.codigo, ''))) AS codigo,
      coalesce(i.quantidade, 0) AS q_proj,
      coalesce(i.quantidade_atendida, 0) AS q_atd
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id AND i.documento_id = p_doc_id
  LOOP
    v_tem_linha := true;
    v_cod := v_linha.codigo;

    IF v_linha.q_proj > 0 AND v_linha.q_atd >= v_linha.q_proj - v_eps THEN
      v_st_linha := 'atendido';
    ELSE
      -- Métricas GLOBAIS por código (todos os documentos + recebimentos válidos)
      SELECT coalesce(sum(di.quantidade), 0), coalesce(sum(di.quantidade_atendida), 0)
      INTO v_prevista_g, v_atendido_g
      FROM public.iso_pro_documento_itens_planejamento di
      INNER JOIN public.iso_pro_documentos_planejamento d
        ON d.tenant_id = di.tenant_id AND d.id = di.documento_id
      WHERE di.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(di.codigo, ''))) = v_cod
        AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado';

      SELECT coalesce(sum(
        CASE
          WHEN lower(btrim(r.modo_recebimento)) = 'direto'
            THEN greatest(coalesce(ri.quantidade, 0), 0)
          WHEN ri.quantidade_conferida IS NOT NULL
            THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
          ELSE greatest(coalesce(ri.quantidade, 0), 0)
        END
      ), 0)
      INTO v_recebido_g
      FROM public.iso_pro_recebimento_itens ri
      INNER JOIN public.iso_pro_recebimentos r
        ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
      WHERE ri.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(ri.codigo, ''))) = v_cod
        AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
        AND (
          lower(btrim(r.modo_recebimento)) = 'direto'
          OR lower(btrim(r.status)) IN ('conferido', 'parcialmente_conferido', 'divergente')
        );

      IF v_recebido_g <= v_eps THEN
        v_st_linha := 'pendente';
      ELSIF v_recebido_g + v_eps < v_prevista_g THEN
        v_st_linha := 'parcial';
      ELSIF v_atendido_g + v_eps < v_prevista_g THEN
        v_st_linha := 'recebido';
      ELSIF v_linha.q_proj > 0 AND v_linha.q_atd + v_eps < v_linha.q_proj THEN
        v_st_linha := 'recebido';
      ELSIF v_atendido_g + v_eps >= v_prevista_g THEN
        v_st_linha := 'atendido';
      ELSIF v_recebido_g + v_eps >= v_prevista_g THEN
        v_st_linha := 'recebido';
      ELSIF v_recebido_g > v_eps THEN
        v_st_linha := 'parcial';
      ELSE
        v_st_linha := 'pendente';
      END IF;
    END IF;

    IF v_st_linha IS DISTINCT FROM 'atendido' THEN
      v_all_atendido := false;
    END IF;
    IF v_st_linha IS DISTINCT FROM 'pendente' THEN
      v_all_pendente := false;
    END IF;
    IF v_st_linha NOT IN ('recebido', 'atendido') THEN
      v_all_recebido_ou_atendido := false;
    END IF;
  END LOOP;

  IF NOT v_tem_linha THEN
    RETURN 'pendente';
  END IF;
  IF v_all_atendido THEN
    RETURN 'atendido';
  END IF;
  IF v_all_recebido_ou_atendido THEN
    RETURN 'recebido';
  END IF;
  IF v_all_pendente THEN
    RETURN 'pendente';
  END IF;
  RETURN 'parcial';
END;
$$;

COMMENT ON FUNCTION public.iso_pro_documento_status_derivado(uuid, text, text) IS
  'Status documento alinhado ao PC Visualizar: atendido/recebido/parcial/pendente com base em baixas + recebimentos por codigo.';

COMMIT;
