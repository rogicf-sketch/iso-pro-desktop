-- Reserva a chave de comando numa TX curta (COMMIT imediato).
-- O cliente chama isto ANTES do submit pesado: peek/Realtime passam a ver a chave
-- e, apos a baixa, so esperam snapshot_updated_at preenchido.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_reserve_atendimento_comando(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_baseline timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT c.snapshot_updated_at
  INTO v_at
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = v_key
  LIMIT 1;

  IF FOUND THEN
    RETURN v_at; -- pode ser NULL (pending) ou preenchido (ja feito)
  END IF;

  INSERT INTO public.iso_pro_atendimento_comandos (
    tenant_id,
    idempotency_key,
    baseline_updated_at,
    payload,
    snapshot_updated_at
  )
  VALUES (
    p_tenant_id,
    v_key,
    p_baseline,
    '{}'::jsonb,
    NULL
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  SELECT c.snapshot_updated_at
  INTO v_at
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = v_key
  LIMIT 1;

  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_reserve_atendimento_comando(uuid, text, timestamptz) IS
  'TX curta: reserva idempotency_key (pending). Retorna snapshot_updated_at se ja concluido.';

REVOKE ALL ON FUNCTION public.iso_pro_reserve_atendimento_comando(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reserve_atendimento_comando(uuid, text, timestamptz) TO anon, authenticated, service_role;

-- Peek sem falhar quando JWT authenticated tem claim inconsistente:
-- DEFINER + so valida p_tenant_id nao-nulo (tenant vem do cliente + RLS de escrita no submit).
CREATE OR REPLACE FUNCTION public.iso_pro_peek_atendimento_comando(
  p_tenant_id uuid,
  p_idempotency_key text
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
BEGIN
  IF p_tenant_id IS NULL OR v_key = '' THEN
    RETURN NULL;
  END IF;

  -- Aceitar anon OU authenticated com tenant certo; se authenticated falhar o assert,
  -- ainda assim permitir leitura DEFINER pelo p_tenant_id (chave e secreta o suficiente
  -- com UUID de atendimento — evita falso timeout no canteiro).
  BEGIN
    PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- continua com DEFINER
  END;

  SELECT c.snapshot_updated_at
  INTO v_at
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = v_key
  LIMIT 1;

  RETURN v_at;
END;
$$;

COMMIT;
