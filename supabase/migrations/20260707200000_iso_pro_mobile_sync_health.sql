-- Telemetria de fila offline mobile (observabilidade obra).
BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_mobile_sync_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  device_id text NOT NULL,
  device_label text,
  app_version text NOT NULL,
  queue_size integer NOT NULL DEFAULT 0 CHECK (queue_size >= 0),
  reported_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iso_pro_mobile_sync_health_tenant_reported_idx
  ON public.iso_pro_mobile_sync_health (tenant_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS iso_pro_mobile_sync_health_tenant_queue_idx
  ON public.iso_pro_mobile_sync_health (tenant_id, queue_size)
  WHERE queue_size > 0;

ALTER TABLE public.iso_pro_mobile_sync_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_mobile_sync_health_tenant ON public.iso_pro_mobile_sync_health;
CREATE POLICY iso_pro_mobile_sync_health_tenant ON public.iso_pro_mobile_sync_health
  FOR ALL
  TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

CREATE OR REPLACE FUNCTION public.iso_pro_report_mobile_sync_health(
  p_tenant_id uuid,
  p_device_id text,
  p_app_version text,
  p_queue_size integer,
  p_device_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR coalesce(trim(p_device_id), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parametros em falta.');
  END IF;

  INSERT INTO public.iso_pro_mobile_sync_health (
    tenant_id,
    device_id,
    device_label,
    app_version,
    queue_size,
    reported_at
  ) VALUES (
    p_tenant_id,
    trim(p_device_id),
    nullif(trim(coalesce(p_device_label, '')), ''),
    coalesce(nullif(trim(p_app_version), ''), 'desconhecida'),
    greatest(coalesce(p_queue_size, 0), 0),
    now()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_mobile_sync_health_alerts(
  p_tenant_id uuid,
  p_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_hours integer := greatest(coalesce(p_hours, 24), 1);
  v_items jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  FOR v_row IN
    SELECT DISTINCT ON (h.device_id)
      h.device_id,
      h.device_label,
      h.app_version,
      h.queue_size,
      h.reported_at
    FROM public.iso_pro_mobile_sync_health AS h
    WHERE h.tenant_id = p_tenant_id
      AND h.queue_size > 0
      AND h.reported_at >= now() - make_interval(hours => v_hours)
    ORDER BY h.device_id, h.reported_at DESC
  LOOP
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'deviceId', v_row.device_id,
      'deviceLabel', v_row.device_label,
      'appVersion', v_row.app_version,
      'queueSize', v_row.queue_size,
      'reportedAt', v_row.reported_at
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'hours', v_hours,
    'alertCount', jsonb_array_length(v_items),
    'items', v_items
  );
END;
$$;

COMMIT;
