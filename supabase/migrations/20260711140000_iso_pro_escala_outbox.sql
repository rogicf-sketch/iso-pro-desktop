-- Outbox servidor: snapshot → tabelas de escala (P4 maturidade).
-- Enfileira em iso_pro_patch_snapshot; flush via RPC (cliente / worker futuro).
BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_escala_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  domain text NOT NULL
    CHECK (domain IN ('documentos', 'recebimentos', 'inventarios', 'rir', 'rnc')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  reason text NOT NULL DEFAULT 'patch',
  patch_keys text[] NOT NULL DEFAULT '{}'::text[],
  snapshot_updated_at timestamptz,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS iso_pro_escala_outbox_pending_tenant_domain_uidx
  ON public.iso_pro_escala_outbox (tenant_id, domain)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS iso_pro_escala_outbox_claim_idx
  ON public.iso_pro_escala_outbox (available_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS iso_pro_escala_outbox_tenant_status_idx
  ON public.iso_pro_escala_outbox (tenant_id, status, created_at DESC);

ALTER TABLE public.iso_pro_escala_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_escala_outbox_tenant_rls ON public.iso_pro_escala_outbox;
CREATE POLICY iso_pro_escala_outbox_tenant_rls
  ON public.iso_pro_escala_outbox FOR SELECT TO anon, authenticated
  USING (public.iso_pro_rls_tenant_row_allowed(tenant_id));

DROP POLICY IF EXISTS iso_pro_escala_outbox_service ON public.iso_pro_escala_outbox;
CREATE POLICY iso_pro_escala_outbox_service
  ON public.iso_pro_escala_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------- enqueue ----------
CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_enqueue(
  p_tenant_id uuid,
  p_domain text,
  p_snapshot_updated_at timestamptz DEFAULT NULL,
  p_patch_keys text[] DEFAULT NULL,
  p_reason text DEFAULT 'patch'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_domain IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_domain NOT IN ('documentos', 'recebimentos', 'inventarios', 'rir', 'rnc') THEN
    RETURN NULL;
  END IF;

  UPDATE public.iso_pro_escala_outbox
  SET
    snapshot_updated_at = COALESCE(p_snapshot_updated_at, snapshot_updated_at),
    patch_keys = COALESCE(p_patch_keys, patch_keys),
    reason = COALESCE(NULLIF(btrim(p_reason), ''), reason),
    available_at = now(),
    error = NULL
  WHERE tenant_id = p_tenant_id
    AND domain = p_domain
    AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.iso_pro_escala_outbox (
    tenant_id, domain, status, reason, patch_keys, snapshot_updated_at, available_at
  ) VALUES (
    p_tenant_id,
    p_domain,
    'pending',
    COALESCE(NULLIF(btrim(p_reason), ''), 'patch'),
    COALESCE(p_patch_keys, '{}'::text[]),
    p_snapshot_updated_at,
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_enqueue(uuid, text, timestamptz, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_enqueue(uuid, text, timestamptz, text[], text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_enqueue_from_patch(
  p_tenant_id uuid,
  p_patch jsonb,
  p_snapshot_updated_at timestamptz
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := 0;
  v_keys text[] := ARRAY[]::text[];
  v_key text;
  v_domain text;
BEGIN
  IF p_tenant_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN 0;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    v_keys := array_append(v_keys, v_key);
    v_domain := CASE v_key
      WHEN 'documentos' THEN 'documentos'
      WHEN 'recebimentos' THEN 'recebimentos'
      WHEN 'inventarios' THEN 'inventarios'
      WHEN 'rirRegistros' THEN 'rir'
      WHEN 'rncRegistros' THEN 'rnc'
      ELSE NULL
    END;
    IF v_domain IS NOT NULL THEN
      PERFORM public.iso_pro_escala_outbox_enqueue(
        p_tenant_id, v_domain, p_snapshot_updated_at, ARRAY[v_key], 'patch'
      );
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_enqueue_from_patch(uuid, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_enqueue_from_patch(uuid, jsonb, timestamptz)
  TO anon, authenticated, service_role;

-- ---------- claim / complete / fail ----------
CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_claim(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS public.iso_pro_escala_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.iso_pro_escala_outbox;
BEGIN
  SELECT * INTO job
  FROM public.iso_pro_escala_outbox
  WHERE status = 'pending'
    AND available_at <= now()
    AND attempts < max_attempts
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  ORDER BY available_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.iso_pro_escala_outbox
  SET
    status = 'processing',
    started_at = COALESCE(started_at, now()),
    attempts = attempts + 1
  WHERE id = job.id
  RETURNING * INTO job;

  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_claim(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_complete(p_job_id uuid)
RETURNS public.iso_pro_escala_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.iso_pro_escala_outbox;
BEGIN
  UPDATE public.iso_pro_escala_outbox
  SET status = 'done', completed_at = now(), error = NULL
  WHERE id = p_job_id
  RETURNING * INTO job;
  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_complete(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_fail(
  p_job_id uuid,
  p_error text,
  p_retry boolean DEFAULT true
)
RETURNS public.iso_pro_escala_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.iso_pro_escala_outbox;
  v_backoff interval;
BEGIN
  SELECT * INTO job FROM public.iso_pro_escala_outbox WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_retry AND job.attempts < job.max_attempts THEN
    v_backoff := make_interval(secs => LEAST(300, power(2, GREATEST(job.attempts, 1))::int * 5));
    UPDATE public.iso_pro_escala_outbox
    SET
      status = 'pending',
      error = left(COALESCE(p_error, 'erro'), 1000),
      available_at = now() + v_backoff
    WHERE id = p_job_id
    RETURNING * INTO job;
  ELSE
    UPDATE public.iso_pro_escala_outbox
    SET
      status = 'failed',
      error = left(COALESCE(p_error, 'erro'), 1000),
      completed_at = now()
    WHERE id = p_job_id
    RETURNING * INTO job;
  END IF;

  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_fail(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_fail(uuid, text, boolean) TO anon, authenticated, service_role;

-- ---------- process one + flush ----------
CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_process_one(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  job public.iso_pro_escala_outbox;
  v_sync jsonb;
  v_err text;
BEGIN
  job := public.iso_pro_escala_outbox_claim(p_tenant_id);
  IF job.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'processed', false);
  END IF;

  BEGIN
    IF job.domain = 'documentos' THEN
      v_sync := public.iso_pro_sync_documentos_planejamento_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'recebimentos' THEN
      v_sync := public.iso_pro_sync_recebimentos_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'inventarios' THEN
      v_sync := public.iso_pro_sync_inventarios_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'rir' THEN
      v_sync := public.iso_pro_sync_rir_from_snapshot(job.tenant_id);
    ELSIF job.domain = 'rnc' THEN
      v_sync := public.iso_pro_sync_rnc_from_snapshot(job.tenant_id);
    ELSE
      RAISE EXCEPTION 'domain desconhecido: %', job.domain;
    END IF;

    IF v_sync IS NOT NULL
      AND jsonb_typeof(v_sync) = 'object'
      AND (v_sync->>'ok') = 'false' THEN
      RAISE EXCEPTION '%', COALESCE(v_sync->>'error', 'sync falhou');
    END IF;

    PERFORM public.iso_pro_escala_outbox_complete(job.id);
    RETURN jsonb_build_object(
      'ok', true,
      'processed', true,
      'jobId', job.id,
      'domain', job.domain,
      'sync', v_sync
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM public.iso_pro_escala_outbox_fail(job.id, v_err, true);
    RETURN jsonb_build_object(
      'ok', false,
      'processed', true,
      'jobId', job.id,
      'domain', job.domain,
      'error', v_err
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_process_one(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_process_one(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_flush_escala_outbox(
  p_tenant_id uuid,
  p_max integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_lim int;
  v_i int := 0;
  v_res jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ok int := 0;
  v_fail int := 0;
  v_noop int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  v_lim := LEAST(GREATEST(COALESCE(p_max, 5), 1), 20);

  WHILE v_i < v_lim LOOP
    v_res := public.iso_pro_escala_outbox_process_one(p_tenant_id);
    IF COALESCE((v_res->>'processed')::boolean, false) = false THEN
      v_noop := v_noop + 1;
      EXIT;
    END IF;
    v_results := v_results || jsonb_build_array(v_res);
    IF COALESCE((v_res->>'ok')::boolean, false) THEN
      v_ok := v_ok + 1;
    ELSE
      v_fail := v_fail + 1;
    END IF;
    v_i := v_i + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_fail = 0,
    'processed', v_ok + v_fail,
    'succeeded', v_ok,
    'failed', v_fail,
    'idle', v_noop > 0,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_flush_escala_outbox(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_flush_escala_outbox(uuid, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pending int := 0;
  v_processing int := 0;
  v_failed int := 0;
  v_done_24h int := 0;
  v_failures jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'processing'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'done' AND completed_at > now() - interval '24 hours')
  INTO v_pending, v_processing, v_failed, v_done_24h
  FROM public.iso_pro_escala_outbox
  WHERE tenant_id = p_tenant_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'domain', o.domain,
        'error', o.error,
        'attempts', o.attempts,
        'at', o.completed_at
      )
      ORDER BY o.completed_at DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_failures
  FROM (
    SELECT *
    FROM public.iso_pro_escala_outbox
    WHERE tenant_id = p_tenant_id AND status = 'failed'
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 10
  ) o;

  RETURN jsonb_build_object(
    'pending', v_pending,
    'processing', v_processing,
    'failed', v_failed,
    'done24h', v_done_24h,
    'failures', v_failures
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_status(uuid) TO anon, authenticated, service_role;

-- ---------- patch_snapshot: assert (outbox via trigger) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_patch_snapshot(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb,
  p_merge_keys text[] DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_rows integer;
  v_current jsonb;
  v_merged jsonb;
  v_key text;
  v_value jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_baseline IS NULL THEN
    INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
    VALUES ('default', p_tenant_id, p_patch, v_new)
    ON CONFLICT (id, tenant_id) DO UPDATE
    SET
      payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb) || EXCLUDED.payload,
      updated_at = v_new;
    RETURN v_new;
  END IF;

  SELECT payload INTO v_current
  FROM public.iso_pro_snapshot
  WHERE id = 'default'
    AND tenant_id = p_tenant_id
    AND updated_at = p_baseline
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_merged := coalesce(v_current, '{}'::jsonb);

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch) LOOP
    IF p_merge_keys IS NOT NULL
      AND v_key = ANY(p_merge_keys)
      AND jsonb_typeof(v_value) = 'array' THEN
      IF v_key = 'documentos' THEN
        v_merged := jsonb_set(
          v_merged,
          ARRAY[v_key],
          public.iso_pro_jsonb_merge_documentos_atendimento_by_id(v_merged->v_key, v_value),
          true
        );
      ELSE
        v_merged := jsonb_set(
          v_merged,
          ARRAY[v_key],
          public.iso_pro_jsonb_merge_array_by_id(v_merged->v_key, v_value),
          true
        );
      END IF;
    ELSE
      v_merged := v_merged || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;

  UPDATE public.iso_pro_snapshot
  SET payload = v_merged,
      updated_at = v_new
  WHERE id = 'default'
    AND tenant_id = p_tenant_id
    AND updated_at = p_baseline;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb, text[]) IS
  'Merge atomico no payload; trigger enfileira outbox escala quando chaves de escala mudam.';

COMMENT ON TABLE public.iso_pro_escala_outbox IS
  'Fila servidor snapshot→tabelas de escala; flush com iso_pro_flush_escala_outbox.';

CREATE OR REPLACE FUNCTION public.iso_pro_snapshot_escala_outbox_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patch jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY[
    'documentos', 'recebimentos', 'inventarios', 'rirRegistros', 'rncRegistros'
  ]
  LOOP
    IF NEW.payload ? v_key AND (
      TG_OP = 'INSERT'
      OR ((OLD.payload -> v_key) IS DISTINCT FROM (NEW.payload -> v_key))
    ) THEN
      v_patch := v_patch || jsonb_build_object(v_key, '1'::jsonb);
    END IF;
  END LOOP;

  IF v_patch <> '{}'::jsonb THEN
    PERFORM public.iso_pro_escala_outbox_enqueue_from_patch(
      NEW.tenant_id, v_patch, NEW.updated_at
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iso_pro_snapshot_escala_outbox ON public.iso_pro_snapshot;
CREATE TRIGGER trg_iso_pro_snapshot_escala_outbox
  AFTER INSERT OR UPDATE OF payload, updated_at ON public.iso_pro_snapshot
  FOR EACH ROW
  EXECUTE PROCEDURE public.iso_pro_snapshot_escala_outbox_trg();

COMMIT;
