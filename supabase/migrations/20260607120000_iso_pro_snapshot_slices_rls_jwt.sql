-- I.S.O PRO — Leitura/gravação parcial do snapshot + RLS JWT (compatível com login anon actual).
-- Não activa JWT hook; quando migrar login Supabase Auth, role authenticated fica restrita ao tenant do token.

BEGIN;

-- ---------- RLS: anon mantém modelo actual; authenticated exige tenant no JWT ----------
CREATE OR REPLACE FUNCTION public.iso_pro_rls_tenant_row_allowed(p_row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'authenticated' THEN p_row_tenant_id = public.iso_pro_jwt_tenant_id()
    ELSE p_row_tenant_id IS NOT NULL
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_rls_tenant_row_allowed(uuid) IS
  'RLS híbrido: anon (app actual) exige tenant_id; authenticated exige claim tenant_id no JWT.';

DO $$
DECLARE
  t text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'iso_pro_snapshot',
    'iso_pro_relatorio_snapshot',
    'usuarios_sistema',
    'dispositivos_mobile',
    'desktop_licencas',
    'materiais',
    'perfis_acesso',
    'usuario_permissoes',
    'perfil_permissoes'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      pol := t || '_anon_rw';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_rls', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated '
        || 'USING (public.iso_pro_rls_tenant_row_allowed(tenant_id)) '
        || 'WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id))',
        t || '_tenant_rls',
        t
      );
    END IF;
  END LOOP;
END $$;

-- service_role snapshot (mantém bypass)
DO $$
BEGIN
  IF to_regclass('public.iso_pro_snapshot') IS NOT NULL THEN
    DROP POLICY IF EXISTS iso_pro_snapshot_service_role ON public.iso_pro_snapshot;
    CREATE POLICY iso_pro_snapshot_service_role
      ON public.iso_pro_snapshot
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ---------- Estatísticas leves (tamanho do payload) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_snapshot_stats(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_bytes integer;
  v_updated timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tenant_id em falta.');
  END IF;

  SELECT pg_column_size(s.payload), s.updated_at
  INTO v_bytes, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'payloadBytes', 0, 'updatedAt', null);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'payloadBytes', coalesce(v_bytes, 0),
    'updatedAt', v_updated
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_snapshot_stats(uuid) IS
  'Tamanho em bytes do JSON snapshot (sem transferir o payload).';

REVOKE ALL ON FUNCTION public.iso_pro_snapshot_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_snapshot_stats(uuid) TO anon, authenticated;

-- ---------- Leitura parcial por chaves ----------
CREATE OR REPLACE FUNCTION public.iso_pro_read_snapshot_slices(
  p_tenant_id uuid,
  p_keys text[]
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
  v_result jsonb := '{}'::jsonb;
  k text;
BEGIN
  IF p_tenant_id IS NULL OR p_keys IS NULL OR array_length(p_keys, 1) IS NULL THEN
    RETURN jsonb_build_object('_error', 'Parametros invalidos.');
  END IF;

  SELECT s.payload, s.updated_at
  INTO v_payload, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  v_result := v_result || jsonb_build_object('_updatedAt', v_updated);

  IF v_payload IS NULL THEN
    RETURN v_result;
  END IF;

  FOREACH k IN ARRAY p_keys LOOP
    IF k IS NULL OR btrim(k) = '' OR k LIKE '\_%' ESCAPE '\' THEN
      CONTINUE;
    END IF;
    IF v_payload ? k THEN
      v_result := v_result || jsonb_build_object(k, v_payload -> k);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_read_snapshot_slices(uuid, text[]) IS
  'Devolve subconjunto do payload + _updatedAt (leitura parcial).';

REVOKE ALL ON FUNCTION public.iso_pro_read_snapshot_slices(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_snapshot_slices(uuid, text[]) TO anon, authenticated;

-- ---------- Gravação parcial (merge jsonb) com lock optimista ----------
CREATE OR REPLACE FUNCTION public.iso_pro_patch_snapshot(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new timestamptz := now();
  v_rows integer;
BEGIN
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

  UPDATE public.iso_pro_snapshot
  SET
    payload = coalesce(payload, '{}'::jsonb) || p_patch,
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

COMMENT ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb) IS
  'Merge atomico no payload (||) com lock optimista em updated_at.';

REVOKE ALL ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_patch_snapshot(uuid, timestamptz, jsonb) TO anon, authenticated;

COMMIT;
