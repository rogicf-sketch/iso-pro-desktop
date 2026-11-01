-- Locks leves de Atendimento (documento em uso por posto).
-- Expiram automaticamente; claim/release via RPC.

CREATE TABLE IF NOT EXISTS public.iso_pro_atendimento_locks (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  documento_id text NOT NULL,
  holder_login text NOT NULL,
  holder_label text NOT NULL DEFAULT '',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_iso_pro_atendimento_locks_expires
  ON public.iso_pro_atendimento_locks (expires_at);

ALTER TABLE public.iso_pro_atendimento_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iso_pro_atendimento_locks_anon_all ON public.iso_pro_atendimento_locks;
CREATE POLICY iso_pro_atendimento_locks_anon_all
  ON public.iso_pro_atendimento_locks
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.iso_pro_atendimento_locks IS
  'Presenca leve: quem tem o desenho aberto no Atendimento (TTL curto).';

CREATE OR REPLACE FUNCTION public.iso_pro_claim_atendimento_lock(
  p_tenant_id uuid,
  p_documento_id text,
  p_holder_login text,
  p_holder_label text DEFAULT '',
  p_ttl_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc text := trim(coalesce(p_documento_id, ''));
  v_login text := lower(trim(coalesce(p_holder_login, '')));
  v_label text := trim(coalesce(p_holder_label, ''));
  v_ttl integer := GREATEST(30, LEAST(coalesce(p_ttl_seconds, 120), 600));
  v_now timestamptz := now();
  v_row public.iso_pro_atendimento_locks%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR v_doc = '' OR v_login = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  DELETE FROM public.iso_pro_atendimento_locks
  WHERE tenant_id = p_tenant_id AND expires_at < v_now;

  SELECT * INTO v_row
  FROM public.iso_pro_atendimento_locks
  WHERE tenant_id = p_tenant_id AND documento_id = v_doc
  FOR UPDATE;

  IF FOUND AND v_row.expires_at >= v_now AND lower(v_row.holder_login) <> v_login THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'held',
      'holder_login', v_row.holder_login,
      'holder_label', v_row.holder_label,
      'expires_at', v_row.expires_at
    );
  END IF;

  INSERT INTO public.iso_pro_atendimento_locks (
    tenant_id, documento_id, holder_login, holder_label, claimed_at, expires_at
  ) VALUES (
    p_tenant_id, v_doc, v_login, v_label, v_now, v_now + make_interval(secs => v_ttl)
  )
  ON CONFLICT (tenant_id, documento_id) DO UPDATE
  SET holder_login = EXCLUDED.holder_login,
      holder_label = EXCLUDED.holder_label,
      claimed_at = EXCLUDED.claimed_at,
      expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object(
    'ok', true,
    'holder_login', v_login,
    'holder_label', v_label,
    'expires_at', v_now + make_interval(secs => v_ttl)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_release_atendimento_lock(
  p_tenant_id uuid,
  p_documento_id text,
  p_holder_login text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc text := trim(coalesce(p_documento_id, ''));
  v_login text := lower(trim(coalesce(p_holder_login, '')));
  v_deleted integer;
BEGIN
  IF p_tenant_id IS NULL OR v_doc = '' OR v_login = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  DELETE FROM public.iso_pro_atendimento_locks
  WHERE tenant_id = p_tenant_id
    AND documento_id = v_doc
    AND lower(holder_login) = v_login;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'released', v_deleted > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.iso_pro_claim_atendimento_lock(uuid, text, text, text, integer)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_release_atendimento_lock(uuid, text, text)
  TO anon, authenticated;
