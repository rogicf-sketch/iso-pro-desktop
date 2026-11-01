-- Timing export docs pages (LIVE smoke).
DO $$
DECLARE
  t0 timestamptz;
  t1 timestamptz;
  v jsonb;
BEGIN
  t0 := clock_timestamp();
  v := public.iso_pro_export_documentos_itens_page('00000000-0000-0000-0000-000000000001'::uuid, 0, 5000);
  t1 := clock_timestamp();
  RAISE NOTICE 'page0 total=% rows=% ms=%',
    v->>'total', jsonb_array_length(v->'rows'),
    round(1000 * extract(epoch from (t1 - t0)));

  t0 := clock_timestamp();
  v := public.iso_pro_export_documentos_itens_page('00000000-0000-0000-0000-000000000001'::uuid, 5000, 5000);
  t1 := clock_timestamp();
  RAISE NOTICE 'page5k rows=% ms=%',
    jsonb_array_length(v->'rows'),
    round(1000 * extract(epoch from (t1 - t0)));

  t0 := clock_timestamp();
  v := public.iso_pro_export_documentos_itens_page('00000000-0000-0000-0000-000000000001'::uuid, 15000, 5000);
  t1 := clock_timestamp();
  RAISE NOTICE 'page15k rows=% ms=%',
    jsonb_array_length(v->'rows'),
    round(1000 * extract(epoch from (t1 - t0)));

  t0 := clock_timestamp();
  PERFORM public.iso_pro_sum_metricas_planejamento_por_codigo('00000000-0000-0000-0000-000000000001'::uuid);
  t1 := clock_timestamp();
  RAISE NOTICE 'metricas ms=%', round(1000 * extract(epoch from (t1 - t0)));

  t0 := clock_timestamp();
  PERFORM public.iso_pro_localizacoes_recebimento_por_codigo('00000000-0000-0000-0000-000000000001'::uuid, NULL);
  t1 := clock_timestamp();
  RAISE NOTICE 'localizacoes ms=%', round(1000 * extract(epoch from (t1 - t0)));
END $$;
