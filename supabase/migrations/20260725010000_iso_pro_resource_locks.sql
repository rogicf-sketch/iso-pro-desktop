-- Locks de edição genéricos (estilo ERP): atendimento, recebimento, RIR, RNC.
-- Acesso à tabela só via RPC (SECURITY DEFINER). RPCs de atendimento passam a wrappers.

BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_resource_locks (
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants(id) ON DELETE CASCADE,
  resource_kind text NOT NULL,
  resource_id text NOT NULL,
  holder_login text NOT NULL,
  holder_label text NOT NULL DEFAULT '',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, resource_kind, resource_id),
  CONSTRAINT iso_pro_resource_locks_kind_chk CHECK (
    resource_kind IN ('atendimento', 'recebimento', 'rir', 'rnc')
  )
);

CREATE INDEX IF NOT EXISTS idx_iso_pro_resource_locks_expires
  ON public.iso_pro_resource_locks (expires_at);

COMMENT ON TABLE public.iso_pro_resource_locks IS
  'Presenca de edicao: quem tem o recurso aberto (TTL curto). Acesso so via RPC.';

ALTER TABLE public.iso_pro_resource_locks ENABLE ROW LEVEL SECURITY;

-- Sem policies abertas: bloquear SELECT/INSERT/UPDATE/DELETE directos.
REVOKE ALL ON TABLE public.iso_pro_resource_locks FROM PUBLIC;
REVOKE ALL ON TABLE public.iso_pro_resource_locks FROM anon, authenticated;
GRANT ALL ON TABLE public.iso_pro_resource_locks TO service_role;

-- Admin activo no tenant (sem senha — mesmo trust boundary do holder_login nas locks).
CREATE OR REPLACE FUNCTION public.iso_pro_usuario_e_admin_tenant(
  p_tenant_id uuid,
  p_actor_login text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS u
    WHERE u.tenant_id = p_tenant_id
      AND lower(trim(u.login)) = lower(trim(p_actor_login))
      AND coalesce(u.ativo, false) = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.perfis_acesso AS pa
          WHERE pa.tenant_id = u.tenant_id
            AND pa.id::text = u.perfil_id::text
            AND lower(trim(pa.codigo)) = 'admin'
        )
        OR EXISTS (
          SELECT 1
          FROM public.usuario_permissoes AS up
          WHERE up.tenant_id = u.tenant_id
            AND up.usuario_id::text = u.id::text
            AND lower(trim(up.modulo)) = 'usuarios'
            AND lower(trim(up.acao)) = 'administrar'
            AND coalesce(up.permitido, false) = true
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.iso_pro_usuario_e_admin_tenant(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_usuario_e_admin_tenant(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iso_pro_claim_resource_lock(
  p_tenant_id uuid,
  p_resource_kind text,
  p_resource_id text,
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
  v_kind text := lower(trim(coalesce(p_resource_kind, '')));
  v_id text := trim(coalesce(p_resource_id, ''));
  v_login text := lower(trim(coalesce(p_holder_login, '')));
  v_label text := trim(coalesce(p_holder_label, ''));
  v_ttl integer := GREATEST(30, LEAST(coalesce(p_ttl_seconds, 120), 600));
  v_now timestamptz := now();
  v_row public.iso_pro_resource_locks%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR v_kind = '' OR v_id = '' OR v_login = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;
  IF v_kind NOT IN ('atendimento', 'recebimento', 'rir', 'rnc') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  END IF;

  DELETE FROM public.iso_pro_resource_locks
  WHERE tenant_id = p_tenant_id AND expires_at < v_now;

  SELECT * INTO v_row
  FROM public.iso_pro_resource_locks
  WHERE tenant_id = p_tenant_id
    AND resource_kind = v_kind
    AND resource_id = v_id
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

  INSERT INTO public.iso_pro_resource_locks (
    tenant_id, resource_kind, resource_id, holder_login, holder_label, claimed_at, expires_at
  ) VALUES (
    p_tenant_id, v_kind, v_id, v_login, v_label, v_now, v_now + make_interval(secs => v_ttl)
  )
  ON CONFLICT (tenant_id, resource_kind, resource_id) DO UPDATE
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

CREATE OR REPLACE FUNCTION public.iso_pro_release_resource_lock(
  p_tenant_id uuid,
  p_resource_kind text,
  p_resource_id text,
  p_holder_login text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(trim(coalesce(p_resource_kind, '')));
  v_id text := trim(coalesce(p_resource_id, ''));
  v_login text := lower(trim(coalesce(p_holder_login, '')));
  v_deleted integer;
BEGIN
  IF p_tenant_id IS NULL OR v_kind = '' OR v_id = '' OR v_login = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;

  DELETE FROM public.iso_pro_resource_locks
  WHERE tenant_id = p_tenant_id
    AND resource_kind = v_kind
    AND resource_id = v_id
    AND lower(holder_login) = v_login;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'released', v_deleted > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_force_release_resource_lock(
  p_tenant_id uuid,
  p_resource_kind text,
  p_resource_id text,
  p_actor_login text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(trim(coalesce(p_resource_kind, '')));
  v_id text := trim(coalesce(p_resource_id, ''));
  v_actor text := lower(trim(coalesce(p_actor_login, '')));
  v_deleted integer;
BEGIN
  IF p_tenant_id IS NULL OR v_kind = '' OR v_id = '' OR v_actor = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_args');
  END IF;
  IF NOT public.iso_pro_usuario_e_admin_tenant(p_tenant_id, v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  DELETE FROM public.iso_pro_resource_locks
  WHERE tenant_id = p_tenant_id
    AND resource_kind = v_kind
    AND resource_id = v_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'released', v_deleted > 0, 'forced', true);
END;
$$;

REVOKE ALL ON FUNCTION public.iso_pro_claim_resource_lock(uuid, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_release_resource_lock(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_force_release_resource_lock(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_claim_resource_lock(uuid, text, text, text, text, integer)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_release_resource_lock(uuid, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_force_release_resource_lock(uuid, text, text, text)
  TO anon, authenticated;

-- Migrar locks de atendimento existentes (se a tabela antiga existir).
DO $$
BEGIN
  IF to_regclass('public.iso_pro_atendimento_locks') IS NOT NULL THEN
    INSERT INTO public.iso_pro_resource_locks (
      tenant_id, resource_kind, resource_id, holder_login, holder_label, claimed_at, expires_at
    )
    SELECT
      tenant_id,
      'atendimento',
      documento_id,
      holder_login,
      holder_label,
      claimed_at,
      expires_at
    FROM public.iso_pro_atendimento_locks
    ON CONFLICT (tenant_id, resource_kind, resource_id) DO UPDATE
    SET holder_login = EXCLUDED.holder_login,
        holder_label = EXCLUDED.holder_label,
        claimed_at = EXCLUDED.claimed_at,
        expires_at = EXCLUDED.expires_at;
  END IF;
END $$;

-- Wrappers: API antiga do Atendimento.
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
BEGIN
  RETURN public.iso_pro_claim_resource_lock(
    p_tenant_id,
    'atendimento',
    p_documento_id,
    p_holder_login,
    p_holder_label,
    p_ttl_seconds
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
BEGIN
  RETURN public.iso_pro_release_resource_lock(
    p_tenant_id,
    'atendimento',
    p_documento_id,
    p_holder_login
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.iso_pro_claim_atendimento_lock(uuid, text, text, text, integer)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_release_atendimento_lock(uuid, text, text)
  TO anon, authenticated;

DROP TABLE IF EXISTS public.iso_pro_atendimento_locks;

COMMIT;
