-- Arquitetura definitiva (fase 1): comandos idempotentes + leitura incremental de desenhos.
-- Requer iso_pro_jsonb_merge_array_by_id (20260705140000).
BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_atendimento_comandos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  baseline_updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  snapshot_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iso_pro_atendimento_comandos_tenant_key UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_comandos_tenant_created_idx
  ON public.iso_pro_atendimento_comandos (tenant_id, created_at DESC);

COMMENT ON TABLE public.iso_pro_atendimento_comandos IS
  'Auditoria + idempotencia de baixas mobile (payload minimo; snapshot actualizado server-side).';

-- Comando idempotente: aplica delta via merge e regista auditoria.
CREATE OR REPLACE FUNCTION public.iso_pro_submit_atendimento_comando(
  p_tenant_id uuid,
  p_idempotency_key text,
  p_baseline timestamptz,
  p_documentos jsonb DEFAULT NULL,
  p_historico_novas jsonb DEFAULT NULL,
  p_lotes_novos jsonb DEFAULT NULL,
  p_sequencia_atendimento bigint DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing timestamptz;
  v_new timestamptz;
  v_payload jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_baseline IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.snapshot_updated_at
  INTO v_existing
  FROM public.iso_pro_atendimento_comandos AS c
  WHERE c.tenant_id = p_tenant_id
    AND c.idempotency_key = btrim(p_idempotency_key)
  LIMIT 1;

  IF FOUND AND v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_new := public.iso_pro_registrar_atendimento_mobile(
    p_tenant_id,
    p_baseline,
    p_documentos,
    p_historico_novas,
    p_lotes_novos,
    p_sequencia_atendimento
  );

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'documentos', p_documentos,
    'atendimentoHistorico', p_historico_novas,
    'atendimentoLotes', p_lotes_novos,
    'sequenciaAtendimento', p_sequencia_atendimento
  ));

  INSERT INTO public.iso_pro_atendimento_comandos (
    tenant_id,
    idempotency_key,
    baseline_updated_at,
    payload,
    snapshot_updated_at
  )
  VALUES (
    p_tenant_id,
    btrim(p_idempotency_key),
    p_baseline,
    v_payload,
    v_new
  )
  ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
  SET snapshot_updated_at = COALESCE(public.iso_pro_atendimento_comandos.snapshot_updated_at, EXCLUDED.snapshot_updated_at)
  RETURNING snapshot_updated_at INTO v_existing;

  RETURN COALESCE(v_existing, v_new);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_submit_atendimento_comando(uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint) IS
  'Atendimento mobile idempotente: payload minimo + registo em iso_pro_atendimento_comandos.';

-- Um desenho completo (evita transferir todos os documentos).
CREATE OR REPLACE FUNCTION public.iso_pro_read_documento_planejamento(
  p_tenant_id uuid,
  p_documento_id text DEFAULT NULL,
  p_numero text DEFAULT NULL,
  p_revisao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_updated timestamptz;
  v_row jsonb;
  v_id text;
  v_num text;
  v_rev text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT s.payload, s.updated_at
  INTO v_payload, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null);
  END IF;

  v_id := NULLIF(btrim(COALESCE(p_documento_id, '')), '');
  v_num := NULLIF(btrim(COALESCE(p_numero, '')), '');
  v_rev := NULLIF(btrim(COALESCE(p_revisao, '')), '');

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    IF v_id IS NOT NULL AND btrim(COALESCE(v_row ->> 'id', '')) = v_id THEN
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_row);
    END IF;
    IF v_id IS NULL AND v_num IS NOT NULL
      AND lower(btrim(COALESCE(v_row ->> 'numero', ''))) = lower(v_num)
      AND (
        v_rev IS NULL
        OR lower(btrim(COALESCE(v_row ->> 'revisao', ''))) = lower(v_rev)
      ) THEN
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_row);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_read_documento_planejamento(uuid, text, text, text) IS
  'Leitura de um desenho do planejamento por id ou numero/revisao.';

-- Desenhos com pendencia para um codigo de material (filtra no servidor).
CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_pendencia_material(
  p_tenant_id uuid,
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_updated timestamptz;
  v_cod text;
  v_doc jsonb;
  v_item jsonb;
  v_q_proj numeric;
  v_q_at numeric;
  v_cod_linha text;
  v_out jsonb := '[]'::jsonb;
  v_tem boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_codigo IS NULL OR btrim(p_codigo) = '' THEN
    RETURN jsonb_build_object('_error', 'Parametros invalidos.');
  END IF;

  v_cod := lower(btrim(p_codigo));

  SELECT s.payload, s.updated_at
  INTO v_payload, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb);
  END IF;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    v_tem := false;
    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_cod_linha := lower(btrim(COALESCE(v_item ->> 'codigo', '')));
        IF v_cod_linha = '' OR v_cod_linha <> v_cod THEN
          CONTINUE;
        END IF;
        v_q_proj := COALESCE(NULLIF(v_item ->> 'quantidade', '')::numeric, 0);
        v_q_at := COALESCE(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0);
        IF v_q_proj - v_q_at > 1e-9 THEN
          v_tem := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_tem THEN
      v_out := v_out || jsonb_build_array(v_doc);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_out);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_pendencia_material(uuid, text) IS
  'Lista desenhos com pendencia de atendimento para um codigo de material.';

REVOKE ALL ON FUNCTION public.iso_pro_submit_atendimento_comando(uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_atendimento_comando(uuid, text, timestamptz, jsonb, jsonb, jsonb, bigint) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.iso_pro_read_documento_planejamento(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_documento_planejamento(uuid, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.iso_pro_list_documentos_pendencia_material(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_documentos_pendencia_material(uuid, text) TO anon, authenticated;

COMMIT;
