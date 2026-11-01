-- Função de lote para seed 100k (staging-load). Chamável N vezes sem timeout no cliente.
CREATE OR REPLACE FUNCTION public.iso_pro_seed_load100k_batch(
  p_tenant_id uuid,
  p_from int,
  p_to int,
  p_itens_por_doc int DEFAULT 4,
  p_mats int DEFAULT 20000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_docs int := 0;
  v_itens int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros invalidos');
  END IF;
  IF p_to - p_from > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote max 5000 docs');
  END IF;

  INSERT INTO public.iso_pro_documentos_planejamento (
    tenant_id, id, numero, revisao, data_documento, descricao, responsavel, status, updated_at
  )
  SELECT
    p_tenant_id,
    'load100k-doc-' || lpad(g::text, 6, '0'),
    'E.LOAD100K-' || lpad(g::text, 6, '0'),
    'A',
    CURRENT_DATE,
    'Desenho prova escala 100k #' || g,
    'LoadTest100k',
    'pendente',
    now()
  FROM generate_series(p_from, p_to) AS g
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_docs = ROW_COUNT;

  INSERT INTO public.iso_pro_documento_itens_planejamento (
    tenant_id, documento_id, id, codigo, descricao, unidade,
    quantidade, quantidade_atendida, localizacao, updated_at
  )
  SELECT
    p_tenant_id,
    'load100k-doc-' || lpad(d::text, 6, '0'),
    'load100k-doc-' || lpad(d::text, 6, '0') || '-it-' || j,
    'LOAD100K-M-' || lpad((((d + j - 1) % p_mats) + 1)::text, 5, '0'),
    'Item escala ' || j,
    'UN',
    10 + (j % 5),
    0,
    'A-' || lpad(((d % 50) + 1)::text, 2, '0'),
    now()
  FROM generate_series(p_from, p_to) AS d
  CROSS JOIN generate_series(1, greatest(p_itens_por_doc, 1)) AS j
  ON CONFLICT (tenant_id, id) DO NOTHING;
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'from', p_from,
    'to', p_to,
    'docs_inserted', v_docs,
    'itens_inserted', v_itens
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_seed_load100k_batch(uuid, int, int, int, int) IS
  'STAGING-LOAD ONLY: lote de docs/itens prefixo load100k- para prova ~100k.';

REVOKE ALL ON FUNCTION public.iso_pro_seed_load100k_batch(uuid, int, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_seed_load100k_batch(uuid, int, int, int, int)
  TO service_role, authenticated;
