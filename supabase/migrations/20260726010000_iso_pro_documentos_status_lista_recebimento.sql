-- Alinha status da lista de planejamento com recebimentos (Pendente/Parcial/Recebido/Atendido).
--
-- Causa: a lista paginada lia so a coluna status (rapida), mas a coluna nao era
-- recalculada apos recebimentos — ficava "Pendente" enquanto o detalhe (metricas
-- ao vivo) ja mostrava Recebido/Parcial.
--
-- Correcoes:
--   1) lista: status_derivado so nas linhas da pagina (como 20260712140000);
--   2) recalcular: actualiza lotes de docs (nao so status NULL);
--   3) apos sync de recebimentos no outbox, refresca status dos desenhos.

BEGIN;

-- 1) Lista: deriva status na pagina (max ~200 linhas)
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
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_col
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
  ),
  pagina_st AS (
    SELECT
      p.*,
      coalesce(a.total_itens, 0) AS total_itens,
      coalesce(a.q_proj, 0) AS q_proj,
      coalesce(a.q_at, 0) AS q_at,
      public.iso_pro_documento_status_derivado(p_tenant_id, p.id, p.status_col) AS status_deriv
    FROM pagina p
    LEFT JOIN agg a ON a.documento_id = p.id
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
          'status', f.status_deriv,
          'totalItens', f.total_itens,
          'quantidadePlanejada', f.q_proj,
          'quantidadeAtendida', f.q_at,
          'itens', '[]'::jsonb
        )
        ORDER BY f.numero
      )
      FROM pagina_st f
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
  'Lista paginada; status derivado (recebimento/atendimento) so nas linhas da pagina.';

-- 2) Recalcular lotes (nao so NULL) — mantem coluna alinhada para filtros
CREATE OR REPLACE FUNCTION public.iso_pro_recalcular_status_documentos_planejamento(
  p_tenant_id uuid,
  p_limit int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_ids text[];
  v_atualizados int := 0;
  v_restantes int := 0;
  v_lim int;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  v_lim := LEAST(GREATEST(coalesce(p_limit, 200), 1), 500);

  SELECT array_agg(d.id) INTO v_ids
  FROM (
    SELECT id
    FROM public.iso_pro_documentos_planejamento
    WHERE tenant_id = p_tenant_id
      AND lower(btrim(coalesce(status, ''))) IS DISTINCT FROM 'cancelado'
    ORDER BY updated_at NULLS FIRST, numero
    LIMIT v_lim
  ) d;

  IF v_ids IS NOT NULL THEN
    UPDATE public.iso_pro_documentos_planejamento d
    SET
      status = public.iso_pro_documento_status_derivado(p_tenant_id, d.id, d.status),
      updated_at = now()
    WHERE d.tenant_id = p_tenant_id AND d.id = ANY (v_ids);
    GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  END IF;

  SELECT count(*)::int INTO v_restantes
  FROM public.iso_pro_documentos_planejamento
  WHERE tenant_id = p_tenant_id
    AND lower(btrim(coalesce(status, ''))) IS DISTINCT FROM 'cancelado';

  RETURN jsonb_build_object(
    'ok', true,
    'atualizados', v_atualizados,
    'restantes', greatest(v_restantes - v_atualizados, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_recalcular_status_documentos_planejamento(uuid, int) IS
  'Recalcula status (recebimento/atendimento) em lotes; chamar em loop ate restantes~0.';

-- 3) Apos sync de recebimentos, refresca status dos desenhos
CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_process_one(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  job public.iso_pro_escala_outbox;
  v_sync jsonb;
  v_err text;
  v_recalc jsonb;
BEGIN
  job := public.iso_pro_escala_outbox_claim(p_tenant_id);
  IF job.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'processed', false);
  END IF;

  BEGIN
    IF job.domain = 'documentos' THEN
      v_sync := public.iso_pro_sync_documentos_planejamento_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'recebimentos' THEN
      v_sync := public.iso_pro_sync_recebimentos_from_snapshot(job.tenant_id);
      -- Recebimento muda cobertura → refresca coluna status dos desenhos.
      IF public.iso_pro_documentos_tabelas_ativas(job.tenant_id) THEN
        v_recalc := public.iso_pro_recalcular_status_documentos_planejamento(job.tenant_id, 500);
      END IF;
    ELSIF job.domain = 'inventarios' THEN
      v_sync := public.iso_pro_sync_inventarios_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'rir' THEN
      v_sync := public.iso_pro_sync_rir_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'rnc' THEN
      v_sync := public.iso_pro_sync_rnc_from_snapshot(job.tenant_id);
    ELSE
      RAISE EXCEPTION 'domain desconhecido: %', job.domain;
    END IF;

    IF v_sync IS NOT NULL
      AND jsonb_typeof(v_sync) = 'object'
      AND (v_sync->>'ok') = 'false' THEN
      RAISE EXCEPTION '%', COALESCE(v_sync->>'error', 'sync falhou');
    END IF;

    PERFORM public.iso_pro_escala_outbox_complete(job.id);
    RETURN jsonb_build_object(
      'ok', true,
      'processed', true,
      'jobId', job.id,
      'domain', job.domain,
      'sync', v_sync,
      'recalcStatus', v_recalc
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM public.iso_pro_escala_outbox_fail(job.id, v_err, true);
    RETURN jsonb_build_object(
      'ok', false,
      'processed', true,
      'jobId', job.id,
      'domain', job.domain,
      'error', v_err
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_process_one(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_process_one(uuid) TO anon, authenticated, service_role;

COMMIT;
