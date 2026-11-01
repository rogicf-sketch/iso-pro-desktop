-- LIVE: preenche contagens + cache de métricas para todos os tenants (sem seed).
-- Seguro: só agrega dados existentes.

DO $$
DECLARE
  r record;
  v_c jsonb;
  v_m jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);
  FOR r IN SELECT id FROM public.iso_pro_tenants LOOP
    BEGIN
      v_c := public.iso_pro_refresh_tenant_contagens(r.id);
      RAISE NOTICE 'contagens % => %', r.id, v_c;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'contagens FAIL %: %', r.id, SQLERRM;
    END;
    BEGIN
      v_m := public.iso_pro_refresh_metricas_planejamento_cache(r.id);
      RAISE NOTICE 'metricas % => %', r.id, v_m;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'metricas FAIL %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

SELECT
  c.tenant_id,
  c.documentos_planejamento AS docs,
  c.recebimentos,
  c.materiais,
  c.updated_at AS contagens_at,
  m.refreshed_at AS metricas_at,
  coalesce(jsonb_typeof(m.por_codigo), 'null') AS metricas_type
FROM public.iso_pro_tenant_contagens c
LEFT JOIN public.iso_pro_metricas_planejamento_cache m ON m.tenant_id = c.tenant_id
ORDER BY c.documentos_planejamento DESC;
