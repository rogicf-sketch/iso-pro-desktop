-- Inventarios table-first (SoT): substitui tabelas + projecao leve no snapshot.
-- skip_escala_outbox evita re-sync snapshot→tabela.

CREATE OR REPLACE FUNCTION public.iso_pro_write_inventarios_sot(
  p_tenant_id uuid,
  p_items jsonb,
  p_baseline timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_arr jsonb := '[]'::jsonb;
  v_sync jsonb;
  v_updated int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'ISO_PRO_INVENTARIOS_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_arr := p_items;

  DELETE FROM public.iso_pro_inventario_itens WHERE tenant_id = p_tenant_id;
  DELETE FROM public.iso_pro_inventarios WHERE tenant_id = p_tenant_id;

  v_sync := public.iso_pro_upsert_inventarios_lote(p_tenant_id, v_arr);
  IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar inventarios.')
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default',
        p_tenant_id,
        jsonb_build_object('inventarios', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('inventarios', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('inventarios', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new
      WHERE s.id = 'default' AND s.tenant_id = p_tenant_id AND s.updated_at = p_baseline;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('iso_pro.skip_escala_outbox', 'off', true);
    RAISE;
  END;

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_write_inventarios_sot(uuid, jsonb, timestamptz) IS
  'SoT inventarios: tabelas primeiro + projecao snapshot (sem outbox escala).';

REVOKE ALL ON FUNCTION public.iso_pro_write_inventarios_sot(uuid, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_inventarios_sot(uuid, jsonb, timestamptz)
  TO anon, authenticated, service_role;
