-- P2 embrionário: log append-only de eventos de domínio (não é Kafka/CQRS completo).
-- Serve para read models futuros (histórico BI, webhooks assinados sob contrato).
-- Escrita: RPC iso_pro_append_domain_event (best-effort a partir do cliente).

BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  actor_login text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'client'
);

CREATE INDEX IF NOT EXISTS iso_pro_domain_events_tenant_created_idx
  ON public.iso_pro_domain_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS iso_pro_domain_events_tenant_type_idx
  ON public.iso_pro_domain_events (tenant_id, event_type, created_at DESC);

COMMENT ON TABLE public.iso_pro_domain_events IS
  'P2: eventos de dominio append-only. Sem UPDATE/DELETE de negocio.';

ALTER TABLE public.iso_pro_domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_domain_events_tenant_rls ON public.iso_pro_domain_events;
CREATE POLICY iso_pro_domain_events_tenant_rls
  ON public.iso_pro_domain_events
  FOR ALL TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_domain_events_service ON public.iso_pro_domain_events;
CREATE POLICY iso_pro_domain_events_service
  ON public.iso_pro_domain_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Sem UPDATE/DELETE para roles de app (append-only operacional).
REVOKE UPDATE, DELETE ON TABLE public.iso_pro_domain_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.iso_pro_domain_events TO anon, authenticated;
GRANT ALL ON TABLE public.iso_pro_domain_events TO service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_append_domain_event(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_actor_login text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'client'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF nullif(btrim(coalesce(p_event_type, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_DOMAIN_EVENT_TYPE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.iso_pro_domain_events (
    tenant_id, event_type, entity_type, entity_id, actor_login, payload, source
  )
  VALUES (
    p_tenant_id,
    lower(btrim(p_event_type)),
    nullif(btrim(coalesce(p_entity_type, '')), ''),
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    nullif(btrim(coalesce(p_actor_login, '')), ''),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(nullif(btrim(p_source), ''), 'client')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_append_domain_event(uuid, text, text, text, text, jsonb, text) IS
  'P2: append evento de dominio (best-effort).';

REVOKE ALL ON FUNCTION public.iso_pro_append_domain_event(uuid, text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_append_domain_event(uuid, text, text, text, text, jsonb, text)
  TO anon, authenticated, service_role;

COMMIT;
