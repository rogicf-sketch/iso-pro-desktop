-- I.S.O PRO — Auth ↔ tenant automático
-- 1) `iso_pro_auth_membership`: mapa auth.users → tenant (Custom Access Token Hook).
-- 2) `usuarios_sistema.auth_user_id`: quando preenchido, trigger mantém membership em sync.
-- 3) RPC `iso_pro_set_usuario_auth_link`: só service_role (ex.: Edge Function com segredo).

-- ---------- iso_pro_auth_membership + hook (idempotente com snippets já aplicados) ----------
CREATE TABLE IF NOT EXISTS public.iso_pro_auth_membership (
  auth_user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.iso_pro_tenants (id),
  usuario_sistema_id text NULL
);

CREATE INDEX IF NOT EXISTS idx_iso_pro_auth_membership_tenant_id
  ON public.iso_pro_auth_membership (tenant_id);

COMMENT ON TABLE public.iso_pro_auth_membership IS
  'Liga auth.users ao tenant ISO PRO; sincronizado por trigger a partir de usuarios_sistema.auth_user_id.';

ALTER TABLE public.iso_pro_auth_membership ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.iso_pro_auth_membership TO supabase_auth_admin;
REVOKE ALL ON public.iso_pro_auth_membership FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
  v_user_id uuid;
  v_tenant uuid;
BEGIN
  v_claims := event->'claims';
  IF v_claims IS NULL OR jsonb_typeof(v_claims) <> 'object' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 500,
        'message', 'ISO PRO hook: claims invalidos.'
      )
    );
  END IF;

  v_user_id := NULLIF(trim(event->>'user_id'), '')::uuid;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 500,
        'message', 'ISO PRO hook: user_id em falta.'
      )
    );
  END IF;

  SELECT m.tenant_id INTO v_tenant
  FROM public.iso_pro_auth_membership AS m
  WHERE m.auth_user_id = v_user_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Conta sem empresa ISO PRO associada. Contacte o administrador.'
      )
    );
  END IF;

  v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text), true);

  RETURN jsonb_build_object('claims', v_claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Supabase Auth: acrescenta claim tenant_id para RLS ISO PRO.';

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon, authenticated, public;

-- ---------- usuarios_sistema.auth_user_id ----------
DO $$
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NULL THEN
    RAISE NOTICE 'iso_pro_auth_membership_auto_sync: usuarios_sistema inexistente, auth_user_id omitido.';
    RETURN;
  END IF;

  ALTER TABLE public.usuarios_sistema
    ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

  DROP INDEX IF EXISTS usuarios_sistema_auth_user_id_uidx;
  CREATE UNIQUE INDEX usuarios_sistema_auth_user_id_uidx
    ON public.usuarios_sistema (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

  COMMENT ON COLUMN public.usuarios_sistema.auth_user_id IS
    'Supabase Auth user id; ao definir, membership JWT é atualizado automaticamente (trigger).';
END $$;

-- ---------- Trigger: sincronizar iso_pro_auth_membership ----------
CREATE OR REPLACE FUNCTION public.iso_pro_sync_auth_membership_from_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.auth_user_id IS NOT NULL THEN
      DELETE FROM public.iso_pro_auth_membership WHERE auth_user_id = OLD.auth_user_id;
    END IF;
    RETURN OLD;
  END IF;

  v_uid := NEW.id::text;

  IF TG_OP = 'UPDATE'
     AND OLD.auth_user_id IS NOT NULL
     AND OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id THEN
    DELETE FROM public.iso_pro_auth_membership WHERE auth_user_id = OLD.auth_user_id;
  END IF;

  IF NEW.auth_user_id IS NOT NULL THEN
    INSERT INTO public.iso_pro_auth_membership (auth_user_id, tenant_id, usuario_sistema_id)
    VALUES (NEW.auth_user_id, NEW.tenant_id, v_uid)
    ON CONFLICT (auth_user_id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          usuario_sistema_id = EXCLUDED.usuario_sistema_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_sync_auth_membership_from_usuario() IS
  'Mantém iso_pro_auth_membership alinhado com usuarios_sistema (SECURITY DEFINER).';

DROP TRIGGER IF EXISTS trg_iso_pro_usuario_auth_membership_ins ON public.usuarios_sistema;
DROP TRIGGER IF EXISTS trg_iso_pro_usuario_auth_membership_upd ON public.usuarios_sistema;
DROP TRIGGER IF EXISTS trg_iso_pro_usuario_auth_membership_del ON public.usuarios_sistema;

DO $$
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NULL THEN
    RETURN;
  END IF;

  CREATE TRIGGER trg_iso_pro_usuario_auth_membership_ins
    AFTER INSERT ON public.usuarios_sistema
    FOR EACH ROW
    EXECUTE PROCEDURE public.iso_pro_sync_auth_membership_from_usuario();

  CREATE TRIGGER trg_iso_pro_usuario_auth_membership_upd
    AFTER UPDATE OF auth_user_id, tenant_id ON public.usuarios_sistema
    FOR EACH ROW
    EXECUTE PROCEDURE public.iso_pro_sync_auth_membership_from_usuario();

  CREATE TRIGGER trg_iso_pro_usuario_auth_membership_del
    AFTER DELETE ON public.usuarios_sistema
    FOR EACH ROW
    EXECUTE PROCEDURE public.iso_pro_sync_auth_membership_from_usuario();
END $$;

REVOKE ALL ON FUNCTION public.iso_pro_sync_auth_membership_from_usuario() FROM PUBLIC;

-- ---------- RPC: controlo centralizado (service_role / Edge Function) ----------
CREATE OR REPLACE FUNCTION public.iso_pro_set_usuario_auth_link(
  p_usuario_id text,
  p_tenant_id uuid,
  p_auth_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
BEGIN
  v_id := trim(p_usuario_id);
  IF v_id = '' THEN
    RAISE EXCEPTION 'iso_pro_set_usuario_auth_link: p_usuario_id em falta';
  END IF;

  UPDATE public.usuarios_sistema AS u
  SET auth_user_id = p_auth_user_id
  WHERE u.tenant_id = p_tenant_id
    AND u.id::text = v_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario nao encontrado para este tenant_id';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_set_usuario_auth_link(text, uuid, uuid) IS
  'Define ou limpa (NULL) auth_user_id; trigger atualiza iso_pro_auth_membership. Apenas service_role.';

REVOKE ALL ON FUNCTION public.iso_pro_set_usuario_auth_link(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_set_usuario_auth_link(text, uuid, uuid) TO service_role;
