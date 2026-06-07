-- Fila de geração de PDF na nuvem (worker Node + Supabase Storage).
BEGIN;

CREATE TABLE IF NOT EXISTS public.pdf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  usuario_id uuid,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  file_name text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_pending_created
  ON public.pdf_jobs (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_tenant_status
  ON public.pdf_jobs (tenant_id, status, created_at DESC);

ALTER TABLE public.pdf_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_jobs_select_anon ON public.pdf_jobs;
CREATE POLICY pdf_jobs_select_anon
  ON public.pdf_jobs FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS pdf_jobs_select_authenticated ON public.pdf_jobs;
CREATE POLICY pdf_jobs_select_authenticated
  ON public.pdf_jobs FOR SELECT TO authenticated
  USING (true);

-- Inserções/updates via Edge Functions (service role) e worker (service role).

CREATE OR REPLACE FUNCTION public.claim_pdf_job()
RETURNS public.pdf_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.pdf_jobs;
BEGIN
  SELECT * INTO job
  FROM public.pdf_jobs
  WHERE status = 'pending'
    AND attempts < max_attempts
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.pdf_jobs
  SET
    status = 'processing',
    started_at = COALESCE(started_at, now()),
    attempts = attempts + 1
  WHERE id = job.id
  RETURNING * INTO job;

  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pdf_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pdf_job() TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pdf_job(
  p_job_id uuid,
  p_storage_path text,
  p_file_name text
)
RETURNS public.pdf_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.pdf_jobs;
BEGIN
  UPDATE public.pdf_jobs
  SET
    status = 'done',
    storage_path = p_storage_path,
    file_name = COALESCE(p_file_name, file_name),
    completed_at = now(),
    error = NULL
  WHERE id = p_job_id
  RETURNING * INTO job;
  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pdf_job(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_pdf_job(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_pdf_job(
  p_job_id uuid,
  p_error text,
  p_retry boolean DEFAULT true
)
RETURNS public.pdf_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.pdf_jobs;
BEGIN
  UPDATE public.pdf_jobs
  SET
    status = CASE
      WHEN p_retry AND attempts < max_attempts THEN 'pending'
      ELSE 'failed'
    END,
    error = LEFT(COALESCE(p_error, 'Erro desconhecido'), 2000),
    completed_at = CASE
      WHEN NOT p_retry OR attempts >= max_attempts THEN now()
      ELSE completed_at
    END
  WHERE id = p_job_id
  RETURNING * INTO job;
  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_pdf_job(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_pdf_job(uuid, text, boolean) TO service_role;

-- Bucket privado para PDFs gerados (TTL via cron pdf_cleanup).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs',
  'pdfs',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Realtime para clientes (status done/failed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pdf_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pdf_jobs;
  END IF;
END $$;

COMMIT;
