-- Materiais para seed 100k (staging-load). Idempotente.
DO $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_mats integer := 20000;
BEGIN
  PERFORM set_config('statement_timeout', '180s', true);
  INSERT INTO public.materiais (
    id, codigo, descricao, unidade, ativo, codigo_barras, tenant_id
  )
  SELECT
    nextval('public.materiais_id_seq'),
    'LOAD100K-M-' || lpad(g::text, 5, '0'),
    'Material escala 100k ' || g,
    'UN',
    true,
    'BC1' || lpad(g::text, 7, '0'),
    v_tenant
  FROM generate_series(1, v_mats) AS g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.materiais m
    WHERE m.tenant_id = v_tenant
      AND m.codigo = 'LOAD100K-M-' || lpad(g::text, 5, '0')
  );
END $$;

SELECT count(*) AS mats_load100k
FROM public.materiais
WHERE codigo LIKE 'LOAD100K-M-%';
