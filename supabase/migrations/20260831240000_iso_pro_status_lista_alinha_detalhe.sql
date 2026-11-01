-- Lista de planejamento = detalhe/folha (resolverStatusDocumentoPlanejamento).
--
-- Causa: iso_pro_documento_status_derivado (202608070130) fazia early-return
--   «qAt>0 → parcial» por perf. Com estoque já coberto, o detalhe mostra Recebido
--   nas linhas e a lista (coluna status) ficava Parcial.
--
-- Contrato (igual ao cliente):
--   Atendido = todas as linhas com qAt >= qProj
--   Recebido = todas as linhas recebido|atendido (estoque cobre; qAt pode ser parcial)
--   Parcial  = mistura / recebimento incompleto
--   Pendente = sem recebimento
--
-- Lista rápida continua a ler a COLUNA (sem status_derivado por linha da página).
-- Heal em massa: iso_pro_heal_status_documentos_planejamento (lotes).

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
  v_n_atendido integer := 0;
  v_n_recebido integer := 0;
  v_n_parcial integer := 0;
  v_n_pendente integer := 0;
BEGIN
  v_status := lower(btrim(coalesce(p_status_col, '')));
  IF v_status = 'cancelado' THEN
    RETURN 'cancelado';
  END IF;

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    IF v_status IN ('pendente', 'parcial', 'recebido', 'atendido', 'cancelado') THEN
      RETURN v_status;
    END IF;
    RETURN 'pendente';
  END IF;

  -- Status por linha (= resolverStatusLinhaDocumento), depois agrega o documento.
  WITH codigos AS (
    SELECT DISTINCT lower(btrim(coalesce(i.codigo, ''))) AS codigo
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id
      AND i.documento_id = p_doc_id
      AND lower(btrim(coalesce(i.codigo, ''))) <> ''
  ),
  metrica AS (
    SELECT
      c.codigo,
      coalesce((
        SELECT sum(di.quantidade)
        FROM public.iso_pro_documento_itens_planejamento di
        INNER JOIN public.iso_pro_documentos_planejamento d
          ON d.tenant_id = di.tenant_id AND d.id = di.documento_id
        WHERE di.tenant_id = p_tenant_id
          AND lower(btrim(coalesce(di.codigo, ''))) = c.codigo
          AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM 'cancelado'
      ), 0) AS prevista,
      CASE
        WHEN NOT public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN 0::numeric
        ELSE coalesce((
          SELECT sum(
            CASE
              WHEN lower(btrim(r.modo_recebimento)) = 'direto'
                THEN greatest(coalesce(ri.quantidade, 0), 0)
              WHEN ri.quantidade_conferida IS NOT NULL
                THEN greatest(coalesce(ri.quantidade_conferida, 0), 0)
              ELSE greatest(coalesce(ri.quantidade, 0), 0)
            END
          )
          FROM public.iso_pro_recebimento_itens ri
          INNER JOIN public.iso_pro_recebimentos r
            ON r.tenant_id = ri.tenant_id AND r.id = ri.recebimento_id
          WHERE ri.tenant_id = p_tenant_id
            AND lower(btrim(coalesce(ri.codigo, ''))) = c.codigo
            AND lower(btrim(coalesce(r.status, ''))) NOT IN ('cancelado', 'rascunho')
            AND (
              lower(btrim(r.modo_recebimento)) = 'direto'
              OR lower(btrim(r.status)) IN ('conferido', 'parcialmente_conferido', 'divergente')
            )
        ), 0)
      END AS recebido
    FROM codigos c
  ),
  linhas AS (
    SELECT
      CASE
        WHEN coalesce(i.quantidade, 0) > 0
          AND coalesce(i.quantidade_atendida, 0) + v_eps >= coalesce(i.quantidade, 0)
          THEN 'atendido'
        WHEN coalesce(m.recebido, 0) <= v_eps
          THEN 'pendente'
        WHEN coalesce(m.recebido, 0) + v_eps < coalesce(m.prevista, 0)
          THEN 'parcial'
        ELSE 'recebido'
      END AS st
    FROM public.iso_pro_documento_itens_planejamento i
    LEFT JOIN metrica m
      ON m.codigo = lower(btrim(coalesce(i.codigo, '')))
    WHERE i.tenant_id = p_tenant_id AND i.documento_id = p_doc_id
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE st = 'atendido')::int,
    count(*) FILTER (WHERE st = 'recebido')::int,
    count(*) FILTER (WHERE st = 'parcial')::int,
    count(*) FILTER (WHERE st = 'pendente')::int
  INTO v_linhas, v_n_atendido, v_n_recebido, v_n_parcial, v_n_pendente
  FROM linhas;

  IF v_linhas = 0 THEN
    RETURN 'pendente';
  END IF;

  IF v_n_atendido = v_linhas THEN
    RETURN 'atendido';
  END IF;

  IF (v_n_recebido + v_n_atendido) = v_linhas THEN
    RETURN 'recebido';
  END IF;

  IF v_n_pendente = v_linhas THEN
    RETURN 'pendente';
  END IF;

  RETURN 'parcial';
END;
$$;

COMMENT ON FUNCTION public.iso_pro_documento_status_derivado(uuid, text, text) IS
  'Status planejamento alinhado ao detalhe: atendido | recebido (estoque cobre; qAt pode ser parcial) | parcial | pendente.';

-- Heal em lotes (evitar timeout no db push). Chamar até remaining=0.
CREATE OR REPLACE FUNCTION public.iso_pro_heal_status_documentos_planejamento(
  p_tenant_id uuid,
  p_limit int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_lim int;
  v_atualizados int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  v_lim := LEAST(GREATEST(coalesce(p_limit, 200), 1), 500);

  WITH alvo AS (
    SELECT d.id
    FROM public.iso_pro_documentos_planejamento d
    WHERE d.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(d.status, ''))) = 'parcial'
    ORDER BY d.numero
    LIMIT v_lim
  ),
  calc AS (
    SELECT
      a.id,
      public.iso_pro_documento_status_derivado(p_tenant_id, a.id, d.status) AS novo
    FROM alvo a
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = p_tenant_id AND d.id = a.id
  )
  UPDATE public.iso_pro_documentos_planejamento d
  SET
    status = c.novo,
    updated_at = now()
  FROM calc c
  WHERE d.tenant_id = p_tenant_id
    AND d.id = c.id
    AND lower(btrim(coalesce(d.status, ''))) IS DISTINCT FROM c.novo;

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'atualizados', v_atualizados,
    'lote', v_lim
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_heal_status_documentos_planejamento(uuid, int) IS
  'Recalcula status (parcial/pendente) em lotes para alinhar lista ao detalhe.';

REVOKE ALL ON FUNCTION public.iso_pro_heal_status_documentos_planejamento(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_heal_status_documentos_planejamento(uuid, int)
  TO anon, authenticated, service_role;

COMMIT;
