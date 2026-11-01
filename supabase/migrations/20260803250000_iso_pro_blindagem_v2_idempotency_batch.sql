-- Blindagem v2: idempotencia RIR/RNC SoT, reconcile historico em lotes, indices.

-- ========== Idempotencia de writes SoT (RIR / RNC) ==========
CREATE TABLE IF NOT EXISTS public.iso_pro_sot_write_idempotency (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  idempotency_key text NOT NULL,
  result_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, domain, idempotency_key),
  CONSTRAINT iso_pro_sot_write_idempotency_domain_chk
    CHECK (domain IN ('rir', 'rnc', 'fornecedores', 'equipamentos', 'etiquetas', 'recebimentos', 'inventarios', 'documentos'))
);

CREATE INDEX IF NOT EXISTS iso_pro_sot_write_idempotency_created_idx
  ON public.iso_pro_sot_write_idempotency (tenant_id, created_at DESC);

ALTER TABLE public.iso_pro_sot_write_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_sot_write_idempotency_tenant ON public.iso_pro_sot_write_idempotency;
CREATE POLICY iso_pro_sot_write_idempotency_tenant
  ON public.iso_pro_sot_write_idempotency
  FOR ALL
  TO authenticated
  USING (public.iso_pro_rls_tenant_authenticated_only(tenant_id))
  WITH CHECK (public.iso_pro_rls_tenant_authenticated_only(tenant_id));

DROP POLICY IF EXISTS iso_pro_sot_write_idempotency_service ON public.iso_pro_sot_write_idempotency;
CREATE POLICY iso_pro_sot_write_idempotency_service
  ON public.iso_pro_sot_write_idempotency
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Indices para reconcile / listagens de lotes
CREATE INDEX IF NOT EXISTS iso_pro_atendimento_lotes_tenant_updated_idx
  ON public.iso_pro_atendimento_lotes (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_lotes_tenant_status_idx
  ON public.iso_pro_atendimento_lotes (tenant_id, lower(btrim(status)));

CREATE INDEX IF NOT EXISTS iso_pro_atendimento_lotes_tenant_data_idx
  ON public.iso_pro_atendimento_lotes (tenant_id, data_atendimento DESC NULLS LAST);

-- Dropar overloads antigos antes de recriar com batch / idempotency
DROP FUNCTION IF EXISTS public.iso_pro_reconcile_atendimento_historico(uuid, boolean);
DROP FUNCTION IF EXISTS public.iso_pro_reconcile_atendimento_historico(uuid, boolean, integer);
DROP FUNCTION IF EXISTS public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb);
DROP FUNCTION IF EXISTS public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb);
DROP FUNCTION IF EXISTS public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb, text);
DROP FUNCTION IF EXISTS public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb, text);

-- ========== Reconcile historico em LOTES (evita timeout em obras grandes) ==========
CREATE OR REPLACE FUNCTION public.iso_pro_reconcile_atendimento_historico(
  p_tenant_id uuid,
  p_heal boolean DEFAULT false,
  p_heal_batch_limit integer DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_payload jsonb;
  v_arr jsonb;
  v_snap_ids text[];
  v_table_ids text[];
  v_missing_table text[];
  v_missing_snap text[];
  v_aligned boolean;
  v_healed boolean := false;
  v_heal_arr jsonb := '[]'::jsonb;
  v_batch_limit int;
  v_healed_count int := 0;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.', 'ok', false);
  END IF;

  v_batch_limit := LEAST(GREATEST(coalesce(p_heal_batch_limit, 40), 1), 200);

  SELECT s.payload
  INTO v_payload
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'emptySnapshot', true,
      'snapshotCount', 0,
      'tableCount', 0,
      'missingInTableCount', 0,
      'missingInSnapshotCount', 0,
      'missingInTable', '[]'::jsonb,
      'missingInSnapshot', '[]'::jsonb,
      'aligned', true,
      'healed', false,
      'healedCount', 0,
      'healBatchLimit', v_batch_limit,
      'diverged', false
    );
  END IF;

  v_arr := coalesce(v_payload -> 'atendimentos', '[]'::jsonb);

  SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::text[])
  INTO v_snap_ids
  FROM (
    SELECT btrim(elem->>'id') AS id
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END
    ) elem
    WHERE btrim(coalesce(elem->>'id', '')) <> ''
  ) x;

  SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
  INTO v_table_ids
  FROM public.iso_pro_atendimento_lotes t
  WHERE t.tenant_id = p_tenant_id;

  SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::text[])
  INTO v_missing_table
  FROM unnest(v_snap_ids) s
  WHERE NOT (s = ANY (v_table_ids));

  SELECT coalesce(array_agg(t ORDER BY t), ARRAY[]::text[])
  INTO v_missing_snap
  FROM unnest(v_table_ids) t
  WHERE NOT (t = ANY (v_snap_ids));

  v_aligned := coalesce(cardinality(v_missing_table), 0) = 0;

  IF NOT v_aligned AND p_heal THEN
    -- Batch: so os primeiros N faltantes (idle heal nao engasga a base).
    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    INTO v_heal_arr
    FROM (
      SELECT elem
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_arr) = 'array' THEN v_arr ELSE '[]'::jsonb END
      ) elem
      WHERE btrim(coalesce(elem->>'id', '')) = ANY (v_missing_table)
      LIMIT v_batch_limit
    ) x;

    IF jsonb_typeof(v_heal_arr) = 'array' AND jsonb_array_length(v_heal_arr) > 0 THEN
      PERFORM public.iso_pro_upsert_atendimento_lotes_from_json(p_tenant_id, v_heal_arr);
      v_healed := true;
      v_healed_count := jsonb_array_length(v_heal_arr);

      SELECT coalesce(array_agg(DISTINCT t.id ORDER BY t.id), ARRAY[]::text[])
      INTO v_table_ids
      FROM public.iso_pro_atendimento_lotes t
      WHERE t.tenant_id = p_tenant_id;

      SELECT coalesce(array_agg(s ORDER BY s), ARRAY[]::text[])
      INTO v_missing_table
      FROM unnest(v_snap_ids) s
      WHERE NOT (s = ANY (v_table_ids));

      v_aligned := coalesce(cardinality(v_missing_table), 0) = 0;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'emptySnapshot', false,
    'snapshotCount', coalesce(cardinality(v_snap_ids), 0),
    'tableCount', coalesce(cardinality(v_table_ids), 0),
    'missingInTableCount', coalesce(cardinality(v_missing_table), 0),
    'missingInSnapshotCount', coalesce(cardinality(v_missing_snap), 0),
    'missingInTable', to_jsonb(coalesce(v_missing_table[1:20], ARRAY[]::text[])),
    'missingInSnapshot', to_jsonb(coalesce(v_missing_snap[1:20], ARRAY[]::text[])),
    'aligned', v_aligned,
    'healed', v_healed,
    'healedCount', v_healed_count,
    'healBatchLimit', v_batch_limit,
    'diverged', NOT v_aligned
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean, integer) IS
  'Compara snapshot.atendimentos vs lotes; heal em lotes (p_heal_batch_limit) para nao timeout.';

REVOKE ALL ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean, integer)
  TO anon, authenticated, service_role;

-- Compat: assinatura antiga (2 args) reencaminha com batch 40.
CREATE OR REPLACE FUNCTION public.iso_pro_reconcile_atendimento_historico(
  p_tenant_id uuid,
  p_heal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN public.iso_pro_reconcile_atendimento_historico(p_tenant_id, p_heal, 40);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reconcile_atendimento_historico(uuid, boolean)
  TO anon, authenticated, service_role;

-- ========== Write RIR SoT com idempotency_key ==========
CREATE OR REPLACE FUNCTION public.iso_pro_write_rir_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_payload jsonb;
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_sync jsonb;
  v_updated int := 0;
  v_key text := NULLIF(btrim(coalesce(p_idempotency_key, '')), '');
  v_cached timestamptz;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT i.result_updated_at INTO v_cached
    FROM public.iso_pro_sot_write_idempotency i
    WHERE i.tenant_id = p_tenant_id AND i.domain = 'rir' AND i.idempotency_key = v_key;
    IF FOUND THEN
      RETURN v_cached;
    END IF;
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RIR_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_rir WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_rir_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RIR (replace).')
        USING ERRCODE = 'P0001';
    END IF;
    v_arr := p_replace_all;
  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_rir(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar RIR.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RIR_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_rir_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RIR (upsert).')
          USING ERRCODE = 'P0001';
      END IF;
      SELECT coalesce(array_agg(DISTINCT btrim(elem->>'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_upsert) elem
      WHERE btrim(coalesce(elem->>'id', '')) <> '';
    END IF;

    SELECT s.payload INTO v_payload
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

    v_arr := coalesce(v_payload -> 'rirRegistros', '[]'::jsonb);
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_arr := '[]'::jsonb;
    END IF;

    IF coalesce(cardinality(p_remove_ids), 0) > 0 OR coalesce(cardinality(v_ids), 0) > 0 THEN
      SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      INTO v_arr
      FROM (
        SELECT elem, ord
        FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(elem, ord)
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
          AND NOT (
            coalesce(cardinality(p_remove_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (p_remove_ids)
          )
          AND NOT (
            coalesce(cardinality(v_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (v_ids)
          )
      ) x;
    END IF;

    IF jsonb_typeof(v_upsert) = 'array' AND jsonb_array_length(v_upsert) > 0 THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    END IF;
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default', p_tenant_id,
        jsonb_build_object('rirRegistros', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('rirRegistros', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('rirRegistros', v_arr, 'dataAtualizacao', v_new),
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

  IF v_key IS NOT NULL THEN
    INSERT INTO public.iso_pro_sot_write_idempotency (tenant_id, domain, idempotency_key, result_updated_at)
    VALUES (p_tenant_id, 'rir', v_key, v_new)
    ON CONFLICT (tenant_id, domain, idempotency_key) DO NOTHING;
  END IF;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_write_rnc_sot(
  p_tenant_id uuid,
  p_baseline timestamptz DEFAULT NULL,
  p_upsert jsonb DEFAULT NULL,
  p_remove_ids text[] DEFAULT NULL,
  p_replace_all jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_payload jsonb;
  v_arr jsonb := '[]'::jsonb;
  v_upsert jsonb := '[]'::jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_sync jsonb;
  v_updated int := 0;
  v_key text := NULLIF(btrim(coalesce(p_idempotency_key, '')), '');
  v_cached timestamptz;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_TENANT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT i.result_updated_at INTO v_cached
    FROM public.iso_pro_sot_write_idempotency i
    WHERE i.tenant_id = p_tenant_id AND i.domain = 'rnc' AND i.idempotency_key = v_key;
    IF FOUND THEN
      RETURN v_cached;
    END IF;
  END IF;

  IF p_replace_all IS NOT NULL THEN
    IF jsonb_typeof(p_replace_all) <> 'array' THEN
      RAISE EXCEPTION 'ISO_PRO_RNC_INVALID' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.iso_pro_rnc WHERE tenant_id = p_tenant_id;
    v_sync := public.iso_pro_upsert_rnc_lote(p_tenant_id, p_replace_all);
    IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RNC (replace).')
        USING ERRCODE = 'P0001';
    END IF;
    v_arr := p_replace_all;
  ELSE
    IF p_remove_ids IS NOT NULL AND coalesce(cardinality(p_remove_ids), 0) > 0 THEN
      v_sync := public.iso_pro_delete_rnc(p_tenant_id, p_remove_ids);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao apagar RNC.')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF p_upsert IS NOT NULL THEN
      IF jsonb_typeof(p_upsert) <> 'array' THEN
        RAISE EXCEPTION 'ISO_PRO_RNC_INVALID' USING ERRCODE = 'P0001';
      END IF;
      v_upsert := p_upsert;
      v_sync := public.iso_pro_upsert_rnc_lote(p_tenant_id, v_upsert);
      IF coalesce((v_sync ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', coalesce(v_sync ->> 'error', 'Falha ao gravar RNC (upsert).')
          USING ERRCODE = 'P0001';
      END IF;
      SELECT coalesce(array_agg(DISTINCT btrim(elem->>'id')), ARRAY[]::text[])
      INTO v_ids
      FROM jsonb_array_elements(v_upsert) elem
      WHERE btrim(coalesce(elem->>'id', '')) <> '';
    END IF;

    SELECT s.payload INTO v_payload
    FROM public.iso_pro_snapshot s
    WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

    v_arr := coalesce(v_payload -> 'rncRegistros', '[]'::jsonb);
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_arr := '[]'::jsonb;
    END IF;

    IF coalesce(cardinality(p_remove_ids), 0) > 0 OR coalesce(cardinality(v_ids), 0) > 0 THEN
      SELECT coalesce(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      INTO v_arr
      FROM (
        SELECT elem, ord
        FROM jsonb_array_elements(v_arr) WITH ORDINALITY AS t(elem, ord)
        WHERE btrim(coalesce(elem->>'id', '')) <> ''
          AND NOT (
            coalesce(cardinality(p_remove_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (p_remove_ids)
          )
          AND NOT (
            coalesce(cardinality(v_ids), 0) > 0
            AND btrim(elem->>'id') = ANY (v_ids)
          )
      ) x;
    END IF;

    IF jsonb_typeof(v_upsert) = 'array' AND jsonb_array_length(v_upsert) > 0 THEN
      v_arr := coalesce(v_arr, '[]'::jsonb) || v_upsert;
    END IF;
  END IF;

  PERFORM set_config('iso_pro.skip_escala_outbox', 'on', true);
  BEGIN
    IF p_baseline IS NULL THEN
      INSERT INTO public.iso_pro_snapshot (id, tenant_id, payload, updated_at)
      VALUES (
        'default', p_tenant_id,
        jsonb_build_object('rncRegistros', v_arr, 'dataAtualizacao', v_new),
        v_new
      )
      ON CONFLICT (id, tenant_id) DO UPDATE SET
        payload = coalesce(public.iso_pro_snapshot.payload, '{}'::jsonb)
          || jsonb_build_object('rncRegistros', v_arr, 'dataAtualizacao', v_new),
        updated_at = v_new;
    ELSE
      UPDATE public.iso_pro_snapshot s
      SET
        payload = coalesce(s.payload, '{}'::jsonb)
          || jsonb_build_object('rncRegistros', v_arr, 'dataAtualizacao', v_new),
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

  IF v_key IS NOT NULL THEN
    INSERT INTO public.iso_pro_sot_write_idempotency (tenant_id, domain, idempotency_key, result_updated_at)
    VALUES (p_tenant_id, 'rnc', v_key, v_new)
    ON CONFLICT (tenant_id, domain, idempotency_key) DO NOTHING;
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rir_sot(uuid, timestamptz, jsonb, text[], jsonb, text)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rnc_sot(uuid, timestamptz, jsonb, text[], jsonb, text)
  TO anon, authenticated, service_role;

-- Manter grants da assinatura antiga (5 args) se ainda existir no catalogo PostgREST
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'iso_pro_write_rir_sot'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, timestamp with time zone, jsonb, text[], jsonb'
  ) THEN
    -- Sobrescrita pela nova; PostgREST usa overload com mais args quando cliente envia p_idempotency_key.
    NULL;
  END IF;
END $$;
