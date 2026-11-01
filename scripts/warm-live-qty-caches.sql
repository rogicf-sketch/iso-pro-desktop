-- LIVE: preenche caches qty recebida/atendida (migrações 20260906).
DO $$
DECLARE
  r record;
  v jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);
  FOR r IN SELECT id FROM public.iso_pro_tenants LOOP
    BEGIN
      v := public.iso_pro_refresh_qty_recebida_por_codigo(r.id);
      RAISE NOTICE 'qty_recebida % => %', r.id, v;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'qty_recebida FAIL %: %', r.id, SQLERRM;
    END;
    BEGIN
      v := public.iso_pro_refresh_qty_atendida_por_codigo(r.id);
      RAISE NOTICE 'qty_atendida % => %', r.id, v;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'qty_atendida FAIL %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

SELECT
  t.id AS tenant_id,
  (SELECT count(*) FROM public.iso_pro_qty_recebida_por_codigo q WHERE q.tenant_id = t.id) AS codigos_recebida,
  (SELECT count(*) FROM public.iso_pro_qty_atendida_por_codigo q WHERE q.tenant_id = t.id) AS codigos_atendida
FROM public.iso_pro_tenants t
ORDER BY codigos_recebida DESC;
