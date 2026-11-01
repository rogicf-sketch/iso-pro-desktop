-- STAGING-LOAD ONLY: seed lotes atendimento + RIR + RNC (prova enterprise completa).
-- Reutiliza docs load100k-doc-* e recebimentos loadent-rec-*.

CREATE OR REPLACE FUNCTION public.iso_pro_seed_load_ent_atendimento_batch(
  p_tenant_id uuid,
  p_from int,
  p_to int,
  p_itens_por_lote int DEFAULT 2,
  p_docs_mod int DEFAULT 200000,
  p_mats int DEFAULT 50000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_lotes int := 0;
  v_itens int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros invalidos');
  END IF;
  IF p_to - p_from > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote max 5000');
  END IF;

  INSERT INTO public.iso_pro_atendimento_lotes (
    tenant_id, id, numero, status, version,
    documento_id, documento_numero, atendente, recebedor, recebedor_tipo,
    data_atendimento, origem, snapshot_atendimento, created_at, updated_at
  )
  SELECT
    p_tenant_id,
    'loadent-atd-' || lpad(g::text, 6, '0'),
    'LOADENT-ATD-' || lpad(g::text, 6, '0'),
    'concluido',
    1,
    'load100k-doc-' || lpad((((g - 1) % greatest(p_docs_mod, 1)) + 1)::text, 6, '0'),
    'E.LOAD100K-' || lpad((((g - 1) % greatest(p_docs_mod, 1)) + 1)::text, 6, '0'),
    'LoadEntAtendente',
    'LoadEntRecebedor',
    'colaborador',
    now() - ((g % 120)::text || ' days')::interval,
    'load-enterprise',
    jsonb_build_object(
      'id', 'loadent-atd-' || lpad(g::text, 6, '0'),
      'numero', 'LOADENT-ATD-' || lpad(g::text, 6, '0'),
      'origem', 'load-enterprise'
    ),
    now(),
    now()
  FROM generate_series(p_from, p_to) AS g
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_lotes = ROW_COUNT;

  INSERT INTO public.iso_pro_atendimento_lote_itens (
    tenant_id, id, lote_id, documento_item_id, documento_id, documento_numero,
    codigo, descricao, unidade, quantidade_atendida, quantidade_retirada_original, updated_at
  )
  SELECT
    p_tenant_id,
    'loadent-atd-' || lpad(d::text, 6, '0') || '-it-' || j,
    'loadent-atd-' || lpad(d::text, 6, '0'),
    'load100k-doc-' || lpad((((d - 1) % greatest(p_docs_mod, 1)) + 1)::text, 6, '0') || '-it-' || j,
    'load100k-doc-' || lpad((((d - 1) % greatest(p_docs_mod, 1)) + 1)::text, 6, '0'),
    'E.LOAD100K-' || lpad((((d - 1) % greatest(p_docs_mod, 1)) + 1)::text, 6, '0'),
    'LOAD100K-M-' || lpad((((d + j - 1) % greatest(p_mats, 1)) + 1)::text, 5, '0'),
    'Item atendimento escala ' || j,
    'UN',
    1 + (j % 3),
    1 + (j % 3),
    now()
  FROM generate_series(p_from, p_to) AS d
  CROSS JOIN generate_series(1, greatest(p_itens_por_lote, 1)) AS j
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'from', p_from,
    'to', p_to,
    'lotes_inserted', v_lotes,
    'itens_inserted', v_itens
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_seed_load_ent_atendimento_batch(uuid, int, int, int, int, int) IS
  'STAGING-LOAD ONLY: lotes atendimento prefixo loadent-atd-.';

REVOKE ALL ON FUNCTION public.iso_pro_seed_load_ent_atendimento_batch(uuid, int, int, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_seed_load_ent_atendimento_batch(uuid, int, int, int, int, int)
  TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_seed_load_ent_rir_batch(
  p_tenant_id uuid,
  p_from int,
  p_to int,
  p_recs_mod int DEFAULT 100000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros invalidos');
  END IF;
  IF p_to - p_from > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote max 5000');
  END IF;

  INSERT INTO public.iso_pro_rir (
    tenant_id, id, codigo, data_registro, status, recebimento_id,
    laudo, responsavel, payload, updated_at
  )
  SELECT
    p_tenant_id,
    'loadent-rir-' || lpad(g::text, 6, '0'),
    'RIR-LOAD-' || lpad(g::text, 6, '0'),
    CURRENT_DATE - ((g % 90)::int),
    CASE WHEN g % 5 = 0 THEN 'fechado' ELSE 'aberto' END,
    'loadent-rec-' || lpad((((g - 1) % greatest(p_recs_mod, 1)) + 1)::text, 6, '0'),
    CASE WHEN g % 7 = 0 THEN 'reprovado' ELSE 'aprovado' END,
    'LoadEntQualidade',
    jsonb_build_object(
      'id', 'loadent-rir-' || lpad(g::text, 6, '0'),
      'codigo', 'RIR-LOAD-' || lpad(g::text, 6, '0'),
      'status', CASE WHEN g % 5 = 0 THEN 'fechado' ELSE 'aberto' END,
      'recebimentoId', 'loadent-rec-' || lpad((((g - 1) % greatest(p_recs_mod, 1)) + 1)::text, 6, '0'),
      'recebimentoNotaFiscal', 'NF-LOAD-' || lpad((((g - 1) % greatest(p_recs_mod, 1)) + 1)::text, 6, '0'),
      'fornecedorNome', 'Fornecedor carga ' || ((g % 50) + 1),
      'descricao', 'RIR prova enterprise #' || g,
      'responsavel', 'LoadEntQualidade',
      'laudo', CASE WHEN g % 7 = 0 THEN 'reprovado' ELSE 'aprovado' END
    ),
    now()
  FROM generate_series(p_from, p_to) AS g
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'rir_inserted', v_n);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_seed_load_ent_rir_batch(uuid, int, int, int) IS
  'STAGING-LOAD ONLY: RIR prefixo loadent-rir-.';

REVOKE ALL ON FUNCTION public.iso_pro_seed_load_ent_rir_batch(uuid, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_seed_load_ent_rir_batch(uuid, int, int, int)
  TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_seed_load_ent_rnc_batch(
  p_tenant_id uuid,
  p_from int,
  p_to int,
  p_recs_mod int DEFAULT 100000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros invalidos');
  END IF;
  IF p_to - p_from > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote max 5000');
  END IF;

  INSERT INTO public.iso_pro_rnc (
    tenant_id, id, codigo, data_registro, status, recebimento_id,
    setor, responsavel, payload, updated_at
  )
  SELECT
    p_tenant_id,
    'loadent-rnc-' || lpad(g::text, 6, '0'),
    'RNC-LOAD-' || lpad(g::text, 6, '0'),
    CURRENT_DATE - ((g % 60)::int),
    CASE WHEN g % 4 = 0 THEN 'fechado' ELSE 'aberto' END,
    'loadent-rec-' || lpad((((g - 1) % greatest(p_recs_mod, 1)) + 1)::text, 6, '0'),
    'Qualidade',
    'LoadEntQualidade',
    jsonb_build_object(
      'id', 'loadent-rnc-' || lpad(g::text, 6, '0'),
      'codigo', 'RNC-LOAD-' || lpad(g::text, 6, '0'),
      'status', CASE WHEN g % 4 = 0 THEN 'fechado' ELSE 'aberto' END,
      'recebimentoId', 'loadent-rec-' || lpad((((g - 1) % greatest(p_recs_mod, 1)) + 1)::text, 6, '0'),
      'setor', 'Qualidade',
      'descricao', 'RNC prova enterprise #' || g,
      'responsavel', 'LoadEntQualidade'
    ),
    now()
  FROM generate_series(p_from, p_to) AS g
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'rnc_inserted', v_n);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_seed_load_ent_rnc_batch(uuid, int, int, int) IS
  'STAGING-LOAD ONLY: RNC prefixo loadent-rnc-.';

REVOKE ALL ON FUNCTION public.iso_pro_seed_load_ent_rnc_batch(uuid, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_seed_load_ent_rnc_batch(uuid, int, int, int)
  TO service_role, authenticated;
