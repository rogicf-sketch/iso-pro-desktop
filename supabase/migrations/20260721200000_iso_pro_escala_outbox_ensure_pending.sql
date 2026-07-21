-- Reabre jobs terminais `failed` (ou garante pending) para um domínio,
-- sem reabrir enqueue genérico a clientes (P2). Usado após falha de dual-write.

CREATE OR REPLACE FUNCTION public.iso_pro_escala_outbox_ensure_pending(
  p_tenant_id uuid,
  p_domain text,
  p_reason text DEFAULT 'dual_write_recovery'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text := lower(trim(COALESCE(p_domain, '')));
  v_updated int := 0;
  v_inserted int := 0;
  v_id uuid;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF v_domain NOT IN ('documentos', 'recebimentos', 'inventarios', 'rir', 'rnc') THEN
    RAISE EXCEPTION 'domain invalido: %', p_domain;
  END IF;

  UPDATE public.iso_pro_escala_outbox
  SET
    status = 'pending',
    error = left(COALESCE(p_reason, 'dual_write_recovery'), 1000),
    available_at = now(),
    completed_at = NULL,
    started_at = NULL,
    attempts = 0
  WHERE tenant_id = p_tenant_id
    AND domain = v_domain
    AND status = 'failed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF EXISTS (
    SELECT 1
    FROM public.iso_pro_escala_outbox
    WHERE tenant_id = p_tenant_id
      AND domain = v_domain
      AND status IN ('pending', 'processing')
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'domain', v_domain,
      'reopenedFailed', v_updated,
      'alreadyQueued', true
    );
  END IF;

  INSERT INTO public.iso_pro_escala_outbox (
    tenant_id, domain, status, reason, patch_keys, snapshot_updated_at, available_at
  )
  VALUES (
    p_tenant_id,
    v_domain,
    'pending',
    left(COALESCE(p_reason, 'dual_write_recovery'), 1000),
    ARRAY[v_domain]::text[],
    now(),
    now()
  )
  RETURNING id INTO v_id;

  v_inserted := 1;

  RETURN jsonb_build_object(
    'ok', true,
    'domain', v_domain,
    'reopenedFailed', v_updated,
    'inserted', v_inserted,
    'jobId', v_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_escala_outbox_ensure_pending(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_escala_outbox_ensure_pending(uuid, text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.iso_pro_escala_outbox_ensure_pending(uuid, text, text) IS
  'Garante job pending (ou reabre failed) para sync snapshot→escala apos falha de dual-write.';
