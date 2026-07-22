-- Auditoria operacional central (who / when / before / after / device / IP).
-- Complementa o log local do PC (authAudit) com trilha na nuvem por tenant.
BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_login text NOT NULL,
  action text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  detail text NOT NULL DEFAULT '',
  before_json jsonb NULL,
  after_json jsonb NULL,
  device_label text NULL,
  user_agent text NULL,
  client_ip text NULL,
  client_kind text NULL
);

CREATE INDEX IF NOT EXISTS iso_pro_audit_log_tenant_created_idx
  ON public.iso_pro_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS iso_pro_audit_log_tenant_action_idx
  ON public.iso_pro_audit_log (tenant_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS iso_pro_audit_log_tenant_actor_idx
  ON public.iso_pro_audit_log (tenant_id, actor_login, created_at DESC);

COMMENT ON TABLE public.iso_pro_audit_log IS
  'Trilha de auditoria operacional: quem/quando/acao/entidade/antes/depois/dispositivo/IP.';

ALTER TABLE public.iso_pro_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_audit_log_tenant_rls ON public.iso_pro_audit_log;
CREATE POLICY iso_pro_audit_log_tenant_rls ON public.iso_pro_audit_log
  FOR ALL TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_audit_log_service ON public.iso_pro_audit_log;
CREATE POLICY iso_pro_audit_log_service ON public.iso_pro_audit_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.iso_pro_audit_log TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.iso_pro_append_audit_log(
  p_tenant_id uuid,
  p_actor_login text,
  p_action text,
  p_detail text DEFAULT '',
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_device_label text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_client_ip text DEFAULT NULL,
  p_client_kind text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor text := nullif(btrim(coalesce(p_actor_login, '')), '');
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR v_actor IS NULL OR v_action IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_AUDIT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.iso_pro_audit_log (
    tenant_id,
    actor_login,
    action,
    entity_type,
    entity_id,
    detail,
    before_json,
    after_json,
    device_label,
    user_agent,
    client_ip,
    client_kind
  )
  VALUES (
    p_tenant_id,
    left(v_actor, 200),
    left(v_action, 120),
    nullif(left(btrim(coalesce(p_entity_type, '')), 80), ''),
    nullif(left(btrim(coalesce(p_entity_id, '')), 200), ''),
    left(coalesce(p_detail, ''), 4000),
    p_before,
    p_after,
    nullif(left(btrim(coalesce(p_device_label, '')), 200), ''),
    nullif(left(btrim(coalesce(p_user_agent, '')), 500), ''),
    nullif(left(btrim(coalesce(p_client_ip, '')), 80), ''),
    nullif(left(btrim(coalesce(p_client_kind, '')), 40), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_append_audit_log(
  uuid, text, text, text, text, text, jsonb, jsonb, text, text, text, text
) IS
  'Insere evento de auditoria operacional no tenant.';

CREATE OR REPLACE FUNCTION public.iso_pro_list_audit_log(
  p_tenant_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_action text DEFAULT NULL,
  p_actor_login text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lim integer := LEAST(GREATEST(coalesce(p_limit, 100), 1), 500);
  v_off integer := GREATEST(coalesce(p_offset, 0), 0);
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_actor text := nullif(btrim(coalesce(p_actor_login, '')), '');
  v_rows jsonb;
  v_total bigint;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT count(*)::bigint
  INTO v_total
  FROM public.iso_pro_audit_log AS a
  WHERE a.tenant_id = p_tenant_id
    AND (v_action IS NULL OR a.action = v_action)
    AND (v_actor IS NULL OR a.actor_login ILIKE v_actor);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id,
      a.created_at,
      a.actor_login,
      a.action,
      a.entity_type,
      a.entity_id,
      a.detail,
      a.before_json,
      a.after_json,
      a.device_label,
      a.user_agent,
      a.client_ip,
      a.client_kind
    FROM public.iso_pro_audit_log AS a
    WHERE a.tenant_id = p_tenant_id
      AND (v_action IS NULL OR a.action = v_action)
      AND (v_actor IS NULL OR a.actor_login ILIKE v_actor)
    ORDER BY a.created_at DESC
    OFFSET v_off
    LIMIT v_lim
  ) AS x;

  RETURN jsonb_build_object(
    'items', v_rows,
    'total', v_total,
    'limit', v_lim,
    'offset', v_off
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_audit_log(uuid, integer, integer, text, text) IS
  'Lista auditoria operacional do tenant (mais recentes primeiro).';

GRANT EXECUTE ON FUNCTION public.iso_pro_append_audit_log(
  uuid, text, text, text, text, text, jsonb, jsonb, text, text, text, text
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.iso_pro_list_audit_log(uuid, integer, integer, text, text)
  TO anon, authenticated;

COMMIT;
