-- Peek leve da chave de comando (SECURITY DEFINER + assert tenant).
-- Usado pelo cliente para confirmar sucesso sem esperar a resposta HTTP do RPC
-- (no canteiro o HTTP pode atrasar 15–40s mesmo com a gravacao ja feita).

BEGIN;

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
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  SELECT c.snapshot_updated_at
  INTO v_at
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = v_key
  LIMIT 1;

  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_peek_atendimento_comando(uuid, text) IS
  'Devolve snapshot_updated_at do comando (NULL se ainda nao gravou). Poll rapido no Confirmar.';

REVOKE ALL ON FUNCTION public.iso_pro_peek_atendimento_comando(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_peek_atendimento_comando(uuid, text) TO anon, authenticated, service_role;

COMMIT;
