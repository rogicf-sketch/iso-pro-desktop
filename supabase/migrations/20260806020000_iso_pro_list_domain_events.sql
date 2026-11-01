-- P2: leitura segura de iso_pro_domain_events (ops / futuros read models).
-- Sem payload completo (smoke leve); filtro opcional por event_type.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_list_domain_events(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_event_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_type text := lower(nullif(btrim(coalesce(p_event_type, '')), ''));
  v_events jsonb;
  v_count integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.', 'events', '[]'::jsonb, '_count', 0);
  END IF;

  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT count(*)::int
  INTO v_count
  FROM public.iso_pro_domain_events e
  WHERE e.tenant_id = p_tenant_id
    AND (v_type IS NULL OR e.event_type = v_type);

  SELECT coalesce(jsonb_agg(row_e ORDER BY ord), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT
      jsonb_build_object(
        'id', e.id,
        'created_at', to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'event_type', e.event_type,
        'entity_type', e.entity_type,
        'entity_id', e.entity_id,
        'actor_login', e.actor_login,
        'source', e.source
      ) AS row_e,
      row_number() OVER (ORDER BY e.created_at DESC, e.id DESC) AS ord
    FROM public.iso_pro_domain_events e
    WHERE e.tenant_id = p_tenant_id
      AND (v_type IS NULL OR e.event_type = v_type)
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT v_limit
  ) x;

  RETURN jsonb_build_object(
    'events', coalesce(v_events, '[]'::jsonb),
    '_count', coalesce(v_count, 0),
    '_limit', v_limit
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_domain_events(uuid, integer, text) IS
  'P2: lista eventos de dominio recentes (sem payload; ops/smoke/read model).';

REVOKE ALL ON FUNCTION public.iso_pro_list_domain_events(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_domain_events(uuid, integer, text)
  TO anon, authenticated, service_role;

COMMIT;
