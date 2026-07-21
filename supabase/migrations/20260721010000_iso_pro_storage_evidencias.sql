-- Bucket Storage para evidências fotográficas (RF / RNC).
-- Separado dos 8 GB de Postgres: fotos vão para o Storage do plano (até 100 GB).
-- Caminho: {tenant_id}/rf/{reportId}/{fotoId}.jpg
--          {tenant_id}/rnc/{rncId}/{itemId}/{index}.jpg

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidencias',
  'evidencias',
  false,
  10485760, -- 10 MB por ficheiro (JPEG comprimido)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper: 1.º segmento do path = tenant_id (uuid texto)
CREATE OR REPLACE FUNCTION public.iso_pro_storage_tenant_path_allowed(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'authenticated' THEN
      (storage.foldername(object_name))[1] = public.iso_pro_jwt_tenant_id()::text
    ELSE
      -- Híbrido actual (anon): exige pasta de tenant não vazia
      coalesce(nullif(btrim((storage.foldername(object_name))[1]), ''), NULL) IS NOT NULL
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_storage_tenant_path_allowed(text) IS
  'RLS Storage evidencias: authenticated exige JWT tenant = 1.º segmento do path; anon exige tenant no path.';

REVOKE ALL ON FUNCTION public.iso_pro_storage_tenant_path_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_storage_tenant_path_allowed(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS evidencias_select ON storage.objects;
DROP POLICY IF EXISTS evidencias_insert ON storage.objects;
DROP POLICY IF EXISTS evidencias_update ON storage.objects;
DROP POLICY IF EXISTS evidencias_delete ON storage.objects;

CREATE POLICY evidencias_select
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.iso_pro_storage_tenant_path_allowed(name)
  );

CREATE POLICY evidencias_insert
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.iso_pro_storage_tenant_path_allowed(name)
  );

CREATE POLICY evidencias_update
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.iso_pro_storage_tenant_path_allowed(name)
  )
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.iso_pro_storage_tenant_path_allowed(name)
  );

CREATE POLICY evidencias_delete
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.iso_pro_storage_tenant_path_allowed(name)
  );

COMMIT;
