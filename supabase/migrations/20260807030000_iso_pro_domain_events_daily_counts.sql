-- P2: rollup leve de iso_pro_domain_events (contagens diarias por tipo, sem MV/Kafka).
-- Idempotente (CREATE OR REPLACE). Sem GRANT anon operacional de escrita.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_domain_events_daily_counts(
  p_tenant_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_from timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => v_days - 1);
  v_days_rows jsonb;
  v_totals jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      '_error', 'tenant_id em falta.',
      'days', '[]'::jsonb,
      'totals', '[]'::jsonb,
      '_from', NULL,
      '_to', NULL,
      '_days', v_days
    );
  END IF;

  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', x.day_key,
        'event_type', x.event_type,
        'count', x.cnt
      )
      ORDER BY x.day_key, x.event_type
    ),
    '[]'::jsonb
  )
  INTO v_days_rows
  FROM (
    SELECT
      to_char(date_trunc('day', e.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day_key,
      e.event_type,
      count(*)::int AS cnt
    FROM public.iso_pro_domain_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.created_at >= v_from
    GROUP BY 1, 2
  ) x;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event_type', y.event_type,
        'count', y.cnt
      )
      ORDER BY y.event_type
    ),
    '[]'::jsonb
  )
  INTO v_totals
  FROM (
    SELECT e.event_type, count(*)::int AS cnt
    FROM public.iso_pro_domain_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.created_at >= v_from
    GROUP BY e.event_type
  ) y;

  RETURN jsonb_build_object(
    'days', coalesce(v_days_rows, '[]'::jsonb),
    'totals', coalesce(v_totals, '[]'::jsonb),
    '_from', to_char(v_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    '_to', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    '_days', v_days
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_domain_events_daily_counts(uuid, integer) IS
  'P2: contagens diarias e totais por event_type (ultimos N dias; max 90). Sem payload.';

REVOKE ALL ON FUNCTION public.iso_pro_domain_events_daily_counts(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_domain_events_daily_counts(uuid, integer)
  TO anon, authenticated, service_role;

COMMIT;
