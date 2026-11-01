-- Perf atendimento mobile (~20s → <2s) — INVARIANTES (não reverter):
-- 1) status_derivado: com qAt>0 o resultado é sempre 'parcial'/'atendido' — a query
--    global de recebimentos por código era trabalho desperdiçado (pior em desenhos grandes).
-- 2) trigger escala_outbox: deixa de disparar em UPDATE só de updated_at (baixa table-first).
-- 3) submit: grava _server_ms no payload do comando para medir RPC puro vs rede/cliente.
-- Guard CI: scripts/check-atendimento-perf-invariants.mjs (via check:blindagem).
-- Rule: .cursor/rules/atendimento-perf-invariants.mdc

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

  -- Já houve baixa neste documento: status operacional é parcial.
  -- A cobertura de recebimentos só importa quando ainda NÃO houve atendimento (v_at≈0).
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

DROP TRIGGER IF EXISTS trg_iso_pro_snapshot_escala_outbox ON public.iso_pro_snapshot;
CREATE TRIGGER trg_iso_pro_snapshot_escala_outbox
  AFTER INSERT OR UPDATE OF payload, documentos
  ON public.iso_pro_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION iso_pro_snapshot_escala_outbox_trg();

CREATE OR REPLACE FUNCTION public.iso_pro_submit_atendimento_comando(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_baseline timestamptz,
  p_documentos jsonb DEFAULT NULL,
  p_historico_novas jsonb DEFAULT NULL,
  p_lotes_novos jsonb DEFAULT NULL,
  p_sequencia_atendimento bigint DEFAULT NULL,
  p_atendimentos jsonb DEFAULT NULL,
  p_estorno_log_novas jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing timestamptz;
  v_new timestamptz;
  v_payload jsonb;
  v_t0 timestamptz := clock_timestamp();
  v_server_ms numeric;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_baseline IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.snapshot_updated_at
  INTO v_existing
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = btrim(p_idempotency_key)
  LIMIT 1;

  IF FOUND AND v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_new := public.iso_pro_registrar_atendimento_mobile(
    p_tenant_id,
    p_baseline,
    p_documentos,
    p_historico_novas,
    p_lotes_novos,
    p_sequencia_atendimento,
    p_atendimentos,
    p_estorno_log_novas
  );

  v_server_ms := round(1000 * extract(epoch from (clock_timestamp() - v_t0)));

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'documentos', p_documentos,
    'atendimentos', p_atendimentos,
    'atendimentoHistorico', p_historico_novas,
    'atendimentoLotes', p_lotes_novos,
    'atendimentoEstornoLog', p_estorno_log_novas,
    'sequenciaAtendimento', p_sequencia_atendimento,
    '_server_ms', v_server_ms
  ));

  INSERT INTO public.iso_pro_atendimento_comandos (
    tenant_id,
    idempotency_key,
    baseline_updated_at,
    payload,
    snapshot_updated_at
  )
  VALUES (
    p_tenant_id,
    btrim(p_idempotency_key),
    p_baseline,
    v_payload,
    v_new
  )
  ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
  SET snapshot_updated_at = COALESCE(public.iso_pro_atendimento_comandos.snapshot_updated_at, EXCLUDED.snapshot_updated_at)
  RETURNING snapshot_updated_at INTO v_existing;

  RETURN COALESCE(v_existing, v_new);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_submit_atendimento_comando(
  uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint, jsonb, jsonb
) IS
  'Comando idempotente atendimento (mobile+PC). Grava _server_ms no payload para telemetria.';

COMMIT;
