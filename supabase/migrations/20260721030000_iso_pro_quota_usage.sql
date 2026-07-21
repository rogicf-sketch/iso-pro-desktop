-- Uso da cota do plano (Postgres ~8 GB + Storage ~100 GB) para o painel Saúde do sistema.
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_quota_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
DECLARE
  v_db bigint := 0;
  v_storage bigint := 0;
  v_evidencias bigint := 0;
  v_pdfs bigint := 0;
BEGIN
  BEGIN
    v_db := pg_database_size(current_database());
  EXCEPTION WHEN OTHERS THEN
    v_db := 0;
  END;

  BEGIN
    SELECT coalesce(sum((o.metadata->>'size')::bigint), 0)
      INTO v_storage
      FROM storage.objects AS o;
  EXCEPTION WHEN OTHERS THEN
    v_storage := 0;
  END;

  BEGIN
    SELECT coalesce(sum((o.metadata->>'size')::bigint), 0)
      INTO v_evidencias
      FROM storage.objects AS o
     WHERE o.bucket_id = 'evidencias';
  EXCEPTION WHEN OTHERS THEN
    v_evidencias := 0;
  END;

  BEGIN
    SELECT coalesce(sum((o.metadata->>'size')::bigint), 0)
      INTO v_pdfs
      FROM storage.objects AS o
     WHERE o.bucket_id = 'pdfs';
  EXCEPTION WHEN OTHERS THEN
    v_pdfs := 0;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'databaseBytes', v_db,
    'storageBytes', v_storage,
    'evidenciasBytes', v_evidencias,
    'pdfsBytes', v_pdfs,
    -- Cotas do plano Pro (referencia I.S.O PRO)
    'databaseLimitBytes', 8589934592,   -- 8 GiB
    'storageLimitBytes', 107374182400   -- 100 GiB
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_quota_usage() IS
  'Painel: bytes usados em Postgres + Storage vs cotas do plano (8 GiB / 100 GiB).';

REVOKE ALL ON FUNCTION public.iso_pro_quota_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_quota_usage() TO anon, authenticated, service_role;

COMMIT;
