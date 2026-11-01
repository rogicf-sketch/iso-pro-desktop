-- P1: cache/MV das contagens do Painel (TTL 90s).
-- Mantém a API `iso_pro_operacao_contagens` (cliente inalterado).
-- Compute fica em `iso_pro_operacao_contagens_compute`; leituras repetidas leem a cache.

BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_operacao_contagens_cache (
  tenant_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.iso_pro_operacao_contagens_cache IS
  'Cache P1 do Painel/badges — preenchida por iso_pro_operacao_contagens (TTL ~90s).';

ALTER TABLE public.iso_pro_operacao_contagens_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_operacao_contagens_cache_tenant_rls ON public.iso_pro_operacao_contagens_cache;
CREATE POLICY iso_pro_operacao_contagens_cache_tenant_rls
  ON public.iso_pro_operacao_contagens_cache
  FOR ALL TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_operacao_contagens_cache_service ON public.iso_pro_operacao_contagens_cache;
CREATE POLICY iso_pro_operacao_contagens_cache_service
  ON public.iso_pro_operacao_contagens_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.iso_pro_operacao_contagens_cache FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.iso_pro_operacao_contagens_cache TO anon, authenticated;
GRANT ALL ON TABLE public.iso_pro_operacao_contagens_cache TO service_role;

-- Corpo de cálculo (ex-iso_pro_operacao_contagens jul/2026 + assert tenant).
CREATE OR REPLACE FUNCTION public.iso_pro_operacao_contagens_compute(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_docs_pendentes int := 0; v_docs_parciais int := 0; v_docs_total int := 0;
  v_rec_aguardando int := 0; v_rec_conferencia int := 0; v_rec_divergentes int := 0;
  v_inv_abertos int := 0; v_inv_divergencia int := 0; v_inv_dias_mais_antigo int := 0;
  v_rir_abertos int := 0; v_rnc_abertas int := 0; v_rir_reprovado_sem_rnc int := 0;
  v_source_docs text := 'snapshot'; v_source_rec text := 'snapshot';
  v_source_inv text := 'snapshot'; v_source_rir text := 'snapshot'; v_source_rnc text := 'snapshot';
  v_rir_arr jsonb; v_rnc_arr jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT s.payload INTO v_payload FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  IF v_payload IS NULL THEN v_payload := '{}'::jsonb; END IF;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    v_source_docs := 'tables';
    WITH agg AS (
      SELECT d.id, lower(btrim(coalesce(d.status,''))) AS st,
        coalesce(sum(i.quantidade),0) AS proj, coalesce(sum(i.quantidade_atendida),0) AS atd
      FROM public.iso_pro_documentos_planejamento d
      LEFT JOIN public.iso_pro_documento_itens_planejamento i ON i.tenant_id = d.tenant_id AND i.documento_id = d.id
      WHERE d.tenant_id = p_tenant_id GROUP BY d.id, d.status
    )
    SELECT count(*)::int,
      count(*) FILTER (WHERE st <> 'cancelado' AND NOT (proj > 0 AND atd >= proj - 1e-9) AND atd <= 1e-9)::int,
      count(*) FILTER (WHERE st <> 'cancelado' AND atd > 1e-9 AND NOT (proj > 0 AND atd >= proj - 1e-9))::int
    INTO v_docs_total, v_docs_pendentes, v_docs_parciais FROM agg;
  ELSE
    SELECT count(*)::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(doc->>'status',''))) IN ('pendente','') OR (doc->>'status') IS NULL)::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(doc->>'status',''))) = 'parcial')::int
    INTO v_docs_total, v_docs_pendentes, v_docs_parciais
    FROM jsonb_array_elements(coalesce(v_payload->'documentos','[]'::jsonb)) doc
    WHERE lower(btrim(coalesce(doc->>'status',''))) <> 'cancelado';
  END IF;

  IF public.iso_pro_recebimentos_tabelas_ativas(p_tenant_id) THEN
    v_source_rec := 'tables';
    SELECT
      count(*) FILTER (WHERE lower(btrim(status)) = 'aguardando_conferencia')::int,
      count(*) FILTER (WHERE lower(btrim(modo_recebimento)) = 'aguardando_conferencia'
        AND lower(btrim(status)) IN ('aguardando_conferencia','parcialmente_conferido','divergente'))::int,
      count(*) FILTER (WHERE lower(btrim(status)) = 'divergente')::int
    INTO v_rec_aguardando, v_rec_conferencia, v_rec_divergentes
    FROM public.iso_pro_recebimentos WHERE tenant_id = p_tenant_id AND lower(btrim(status)) <> 'cancelado';
  ELSE
    SELECT
      count(*) FILTER (WHERE lower(btrim(coalesce(r->>'status',''))) = 'aguardando_conferencia')::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(r->>'modoRecebimento', coalesce(r->>'modo_recebimento','')))) = 'aguardando_conferencia'
        AND lower(btrim(coalesce(r->>'status',''))) IN ('aguardando_conferencia','parcialmente_conferido','divergente'))::int,
      count(*) FILTER (WHERE lower(btrim(coalesce(r->>'status',''))) = 'divergente'
        OR coalesce((r->>'conferenciaItensDivergentes')::numeric,0) > 0)::int
    INTO v_rec_aguardando, v_rec_conferencia, v_rec_divergentes
    FROM jsonb_array_elements(coalesce(v_payload->'recebimentos','[]'::jsonb)) r
    WHERE lower(btrim(coalesce(r->>'status',''))) <> 'cancelado';
  END IF;

  IF public.iso_pro_inventarios_tabelas_ativas(p_tenant_id) THEN
    v_source_inv := 'tables';
    SELECT count(*) FILTER (WHERE lower(btrim(status)) = 'aberto')::int,
      coalesce(max(CASE WHEN lower(btrim(status)) = 'aberto' AND data_inventario IS NOT NULL
        THEN GREATEST(0, (CURRENT_DATE - data_inventario)) ELSE NULL END), 0)::int
    INTO v_inv_abertos, v_inv_dias_mais_antigo
    FROM public.iso_pro_inventarios WHERE tenant_id = p_tenant_id;
    SELECT count(DISTINCT i.id)::int INTO v_inv_divergencia
    FROM public.iso_pro_inventarios i
    JOIN public.iso_pro_inventario_itens it ON it.tenant_id = i.tenant_id AND it.inventario_id = i.id
    WHERE i.tenant_id = p_tenant_id AND lower(btrim(i.status)) <> 'cancelado'
      AND coalesce(it.saldo_sistema,0) <> coalesce(it.quantidade_contada,0);
  ELSE
    SELECT
      count(*) FILTER (WHERE lower(btrim(coalesce(i->>'status',''))) = 'aberto')::int,
      count(*) FILTER (WHERE coalesce((i->>'divergencias')::numeric,0) > 0
        AND lower(btrim(coalesce(i->>'status',''))) <> 'cancelado')::int,
      coalesce(max(CASE WHEN lower(btrim(coalesce(i->>'status',''))) = 'aberto'
        AND nullif(btrim(coalesce(i->>'dataInventario', i->>'data','')),'') IS NOT NULL
        THEN GREATEST(0, (CURRENT_DATE - nullif(btrim(coalesce(i->>'dataInventario', i->>'data','')),'')::date))
        ELSE NULL END), 0)::int
    INTO v_inv_abertos, v_inv_divergencia, v_inv_dias_mais_antigo
    FROM jsonb_array_elements(coalesce(v_payload->'inventarios','[]'::jsonb)) i;
  END IF;

  IF public.iso_pro_rir_tabelas_ativas(p_tenant_id) THEN
    v_source_rir := 'tables';
    SELECT count(*)::int INTO v_rir_abertos FROM public.iso_pro_rir
    WHERE tenant_id = p_tenant_id AND lower(btrim(status)) NOT IN ('tratado','cancelado');
  ELSE
    v_rir_arr := coalesce(v_payload->'rirRegistros', v_payload->'rir', '[]'::jsonb);
    SELECT count(*)::int INTO v_rir_abertos FROM jsonb_array_elements(v_rir_arr) r
    WHERE lower(btrim(coalesce(r->>'status',''))) NOT IN ('tratado','cancelado');
  END IF;

  IF public.iso_pro_rnc_tabelas_ativas(p_tenant_id) THEN
    v_source_rnc := 'tables';
    SELECT count(*)::int INTO v_rnc_abertas FROM public.iso_pro_rnc
    WHERE tenant_id = p_tenant_id AND lower(btrim(status)) NOT IN ('concluido','cancelado');
  ELSE
    v_rnc_arr := coalesce(v_payload->'rncRegistros', v_payload->'rnc', '[]'::jsonb);
    SELECT count(*)::int INTO v_rnc_abertas FROM jsonb_array_elements(v_rnc_arr) r
    WHERE lower(btrim(coalesce(r->>'status',''))) NOT IN ('concluido','cancelado');
  END IF;

  IF public.iso_pro_rir_tabelas_ativas(p_tenant_id) AND public.iso_pro_rnc_tabelas_ativas(p_tenant_id) THEN
    SELECT count(*)::int INTO v_rir_reprovado_sem_rnc
    FROM public.iso_pro_rir rr
    WHERE rr.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(rr.laudo,''))) = 'reprovado'
      AND lower(btrim(rr.status)) NOT IN ('tratado','cancelado')
      AND btrim(rr.recebimento_id) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.iso_pro_rnc n
        WHERE n.tenant_id = p_tenant_id
          AND btrim(n.recebimento_id) = btrim(rr.recebimento_id)
          AND lower(btrim(n.status)) <> 'cancelado'
      );
  ELSE
    v_rir_arr := coalesce(v_payload->'rirRegistros', v_payload->'rir', '[]'::jsonb);
    v_rnc_arr := coalesce(v_payload->'rncRegistros', v_payload->'rnc', '[]'::jsonb);
    WITH rir_rep AS (
      SELECT btrim(coalesce(r->>'recebimentoId', r->>'recebimento_id','')) AS rid
      FROM jsonb_array_elements(v_rir_arr) r
      WHERE lower(btrim(coalesce(r->>'laudo',''))) = 'reprovado'
        AND lower(btrim(coalesce(r->>'status',''))) NOT IN ('tratado','cancelado')
        AND btrim(coalesce(r->>'recebimentoId', r->>'recebimento_id','')) <> ''
    ),
    rnc_ativa AS (
      SELECT DISTINCT btrim(coalesce(n->>'recebimentoId', n->>'recebimento_id','')) AS rid
      FROM jsonb_array_elements(v_rnc_arr) n
      WHERE lower(btrim(coalesce(n->>'status',''))) <> 'cancelado'
        AND btrim(coalesce(n->>'recebimentoId', n->>'recebimento_id','')) <> ''
    )
    SELECT count(*)::int INTO v_rir_reprovado_sem_rnc
    FROM rir_rep rr WHERE NOT EXISTS (SELECT 1 FROM rnc_ativa ra WHERE ra.rid = rr.rid);
  END IF;

  RETURN jsonb_build_object(
    'docsPendentes', v_docs_pendentes + v_docs_parciais,
    'docsStatusPendente', v_docs_pendentes, 'docsStatusParcial', v_docs_parciais, 'docsTotal', v_docs_total,
    'recebimentosAguardando', v_rec_aguardando, 'conferenciaPendente', v_rec_conferencia,
    'recebimentosDivergentes', v_rec_divergentes,
    'inventariosAbertos', v_inv_abertos, 'inventariosComDivergencia', v_inv_divergencia,
    'inventarioDiasMaisAntigo', v_inv_dias_mais_antigo,
    'rirAbertos', v_rir_abertos, 'rncAbertas', v_rnc_abertas, 'rirReprovadoSemRnc', v_rir_reprovado_sem_rnc,
    '_sourceDocs', v_source_docs, '_sourceRecebimentos', v_source_rec,
    '_sourceInventarios', v_source_inv, '_sourceRir', v_source_rir, '_sourceRnc', v_source_rnc
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_operacao_contagens_compute(uuid) IS
  'Calcula contagens do Painel (sem cache). Preferir iso_pro_operacao_contagens.';

-- API pública: cache TTL 90s + fallback compute.
CREATE OR REPLACE FUNCTION public.iso_pro_operacao_contagens(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cached jsonb;
  v_at timestamptz;
  v_fresh jsonb;
  v_ttl interval := interval '90 seconds';
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT c.payload, c.refreshed_at
  INTO v_cached, v_at
  FROM public.iso_pro_operacao_contagens_cache c
  WHERE c.tenant_id = p_tenant_id;

  IF v_cached IS NOT NULL
     AND NOT (v_cached ? '_error')
     AND v_at IS NOT NULL
     AND v_at > (now() - v_ttl) THEN
    RETURN v_cached || jsonb_build_object(
      '_cacheHit', true,
      '_cacheAgeMs', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_at)) * 1000)::bigint)
    );
  END IF;

  v_fresh := public.iso_pro_operacao_contagens_compute(p_tenant_id);
  IF v_fresh IS NULL OR (v_fresh ? '_error') THEN
    RETURN coalesce(v_fresh, jsonb_build_object('_error', 'contagens falhou.'));
  END IF;

  INSERT INTO public.iso_pro_operacao_contagens_cache AS c (tenant_id, payload, refreshed_at)
  VALUES (p_tenant_id, v_fresh, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET payload = EXCLUDED.payload,
        refreshed_at = EXCLUDED.refreshed_at;

  RETURN v_fresh || jsonb_build_object('_cacheHit', false, '_cacheAgeMs', 0);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_operacao_contagens(uuid) IS
  'Contagens leves Painel/badges com cache TTL 90s (iso_pro_operacao_contagens_cache).';

-- Invalida cache (writes críticos / ops). Próxima leitura recalcula.
CREATE OR REPLACE FUNCTION public.iso_pro_invalidate_operacao_contagens(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  DELETE FROM public.iso_pro_operacao_contagens_cache WHERE tenant_id = p_tenant_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_operacao_contagens_compute(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_operacao_contagens(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_invalidate_operacao_contagens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_operacao_contagens_compute(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iso_pro_operacao_contagens(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iso_pro_invalidate_operacao_contagens(uuid) TO anon, authenticated, service_role;

COMMIT;
