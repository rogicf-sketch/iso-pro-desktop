-- Seed enterprise: recebimentos + materiais extra (staging-load ONLY).
-- Aplica via SQL editor / psql no projecto sacaiokhqhegvtpzlpkf — nunca LIVE.

CREATE OR REPLACE FUNCTION public.iso_pro_seed_load_ent_recebimentos_batch(
  p_tenant_id uuid,
  p_from int,
  p_to int,
  p_itens_por_nf int DEFAULT 3,
  p_mats int DEFAULT 50000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_recs int := 0;
  v_itens int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros invalidos');
  END IF;
  IF p_to - p_from > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote max 5000 recebimentos');
  END IF;

  INSERT INTO public.iso_pro_recebimentos (
    tenant_id, id, fornecedor, data_recebimento, nota_fiscal, romaneio,
    conferente, modo_recebimento, status, observacoes, updated_at
  )
  SELECT
    p_tenant_id,
    'loadent-rec-' || lpad(g::text, 6, '0'),
    'Fornecedor carga ' || ((g % 50) + 1),
    CURRENT_DATE - ((g % 90)::int),
    'NF-LOAD-' || lpad(g::text, 6, '0'),
    'ROM-' || lpad(g::text, 6, '0'),
    'LoadEnt',
    'direto',
    'conferido',
    'Seed enterprise escala',
    now()
  FROM generate_series(p_from, p_to) AS g
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_recs = ROW_COUNT;

  INSERT INTO public.iso_pro_recebimento_itens (
    tenant_id, recebimento_id, id, codigo, descricao, unidade,
    localizacao, quantidade, quantidade_conferida, updated_at
  )
  SELECT
    p_tenant_id,
    'loadent-rec-' || lpad(d::text, 6, '0'),
    'loadent-rec-' || lpad(d::text, 6, '0') || '-it-' || j,
    'LOAD100K-M-' || lpad((((d + j - 1) % p_mats) + 1)::text, 5, '0'),
    'Item NF escala ' || j,
    'UN',
    'R-' || lpad(((d % 40) + 1)::text, 2, '0'),
    5 + (j % 4),
    5 + (j % 4),
    now()
  FROM generate_series(p_from, p_to) AS d
  CROSS JOIN generate_series(1, greatest(p_itens_por_nf, 1)) AS j
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'from', p_from,
    'to', p_to,
    'recebimentos_inserted', v_recs,
    'itens_inserted', v_itens
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_seed_load_ent_recebimentos_batch(uuid, int, int, int, int) IS
  'STAGING-LOAD ONLY: lote de recebimentos prefixo loadent-rec- para prova ~100k NFs.';

REVOKE ALL ON FUNCTION public.iso_pro_seed_load_ent_recebimentos_batch(uuid, int, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_seed_load_ent_recebimentos_batch(uuid, int, int, int, int)
  TO service_role, authenticated;
