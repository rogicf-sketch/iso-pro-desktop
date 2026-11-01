-- SoT configuracoesSistema: deixa de depender de iso_pro_patch_snapshot no cliente.
-- Merge OCC no payload (config + disciplinas/unidades opcionais) com skip_escala_outbox.
-- Sem EXECUTE para anon (JWT onda 2).

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_write_configuracoes_sot(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_configuracoes jsonb,
  p_disciplinas jsonb DEFAULT NULL,
  p_unidades jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_new timestamptz := now();
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);

  IF p_tenant_id IS NULL OR p_baseline IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_configuracoes IS NULL OR jsonb_typeof(p_configuracoes) <> 'object' THEN
    RAISE EXCEPTION 'ISO_PRO_CONFIG_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    UPDATE public.iso_pro_snapshot s
    SET
      payload = coalesce(s.payload, '{}'::jsonb)
        || jsonb_build_object(
          'configuracoesSistema',
          coalesce(s.payload -> 'configuracoesSistema', '{}'::jsonb) || p_configuracoes
        )
        || CASE
             WHEN p_disciplinas IS NOT NULL AND jsonb_typeof(p_disciplinas) = 'array'
               THEN jsonb_build_object('disciplinas', p_disciplinas)
             ELSE '{}'::jsonb
           END
        || CASE
             WHEN p_unidades IS NOT NULL AND jsonb_typeof(p_unidades) = 'array'
               THEN jsonb_build_object('unidades', p_unidades)
             ELSE '{}'::jsonb
           END
        || jsonb_build_object(
          'dataAtualizacao',
          to_char(v_new AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
      updated_at = v_new
    WHERE s.id = 'default'
      AND s.tenant_id = p_tenant_id
      AND s.updated_at = p_baseline;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_configuracoes_sot(uuid, timestamptz, jsonb, jsonb, jsonb) IS
  'SoT configuracoesSistema (+ disciplinas/unidades opcionais). Sem EXECUTE anon.';

REVOKE ALL ON FUNCTION public.iso_pro_write_configuracoes_sot(uuid, timestamptz, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_configuracoes_sot(uuid, timestamptz, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

COMMIT;
