-- Painel admin Fase 2: auditoria de comandos de atendimento (mobile + PC).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_list_atendimento_comandos(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total bigint;
  v_pendentes bigint;
  v_sucesso_24h bigint;
  v_items jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT COUNT(*)::bigint
  INTO v_total
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id;

  SELECT COUNT(*)::bigint
  INTO v_pendentes
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.snapshot_updated_at IS NULL;

  SELECT COUNT(*)::bigint
  INTO v_sucesso_24h
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.snapshot_updated_at IS NOT NULL
    AND c.created_at >= now() - interval '24 hours';

  FOR v_row IN
    SELECT
      c.id,
      c.idempotency_key,
      c.baseline_updated_at,
      c.snapshot_updated_at,
      c.payload,
      c.created_at
    FROM public.iso_pro_atendimento_comandos AS c
    WHERE c.tenant_id = p_tenant_id
    ORDER BY c.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  LOOP
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'idempotencyKey', v_row.idempotency_key,
      'baselineUpdatedAt', v_row.baseline_updated_at,
      'snapshotUpdatedAt', v_row.snapshot_updated_at,
      'createdAt', v_row.created_at,
      'status',
        CASE
          WHEN v_row.snapshot_updated_at IS NOT NULL THEN 'ok'
          ELSE 'pendente'
        END,
      'historicoCount',
        CASE
          WHEN jsonb_typeof(v_row.payload->'atendimentoHistorico') = 'array'
            THEN jsonb_array_length(v_row.payload->'atendimentoHistorico')
          ELSE 0
        END,
      'documentosCount',
        CASE
          WHEN jsonb_typeof(v_row.payload->'documentos') = 'array'
            THEN jsonb_array_length(v_row.payload->'documentos')
          ELSE 0
        END,
      'origem',
        CASE
          WHEN v_row.idempotency_key LIKE 'pc-%' THEN 'pc'
          WHEN v_row.idempotency_key LIKE 'at-%' THEN 'mobile'
          WHEN v_row.idempotency_key LIKE 'reconcile-%' THEN 'reconciliacao'
          ELSE 'outro'
        END
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'pendentes', v_pendentes,
    'sucesso24h', v_sucesso_24h,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_atendimento_comandos(uuid, integer, integer) IS
  'Painel admin: lista comandos idempotentes de atendimento (auditoria sync mobile/PC).';

REVOKE ALL ON FUNCTION public.iso_pro_list_atendimento_comandos(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_atendimento_comandos(uuid, integer, integer) TO anon, authenticated;

COMMIT;
