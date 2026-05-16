-- =============================================================================
-- I.S.O PRO — Setup completo na nuvem (cole UMA vez no SQL Editor do Supabase)
-- =============================================================================
-- Onde: Dashboard → SQL Editor → novo separador → Role: postgres → Run
--
-- Isto aplica o mesmo que os ficheiros em supabase/migrations/ (nesta ordem):
--   1) 20260205120000_iso_pro_multi_tenant.sql
--   2) 20260207130000_iso_pro_auth_membership_auto_sync.sql
--
-- Preferível em projetos ligados ao CLI: na pasta iso-pro-desktop → supabase db push
-- (evita duplicar texto). Este snippet serve para quem só usa o browser.
--
-- Depois deste script:
--   • Auth → registar Custom Access Token Hook → função public.custom_access_token_hook
--   • Nova empresa: snippets/provision_novo_tenant.sql (ajustar slug, login, senha)
-- =============================================================================

-- ========== INÍCIO: 20260205120000_iso_pro_multi_tenant.sql ==========

-- I.S.O PRO — fundação multi-tenant (um projeto Supabase, várias empresas).
-- 1) Executar após backup.
-- 2) A app cliente envia `tenant_id` em todas as operações (chave anon actual).
-- 3) Para RLS restritiva nos dados com anon, é necessário migrar para Supabase Auth + JWT
--    (claim `tenant_id` ou tabela `auth.users`) e políticas `USING (tenant_id = ...)`;
--    até lá o isolamento é garantido pela aplicação + colunas NOT NULL.

BEGIN;

CREATE TABLE IF NOT EXISTS public.iso_pro_tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.iso_pro_tenants (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'default', 'Organização principal')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.iso_pro_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iso_pro_tenants_select_anon" ON public.iso_pro_tenants;
CREATE POLICY "iso_pro_tenants_select_anon"
  ON public.iso_pro_tenants FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "iso_pro_tenants_select_authenticated" ON public.iso_pro_tenants;
CREATE POLICY "iso_pro_tenants_select_authenticated"
  ON public.iso_pro_tenants FOR SELECT TO authenticated USING (true);

-- Escreve novas empresas via SQL (service role) ou política futura para administradores.

-- ---------- materiais ----------
DO $$
BEGIN
  IF to_regclass('public.materiais') IS NOT NULL THEN
    ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
    UPDATE public.materiais SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE public.materiais ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_materiais_tenant_id ON public.materiais(tenant_id);
  END IF;
END $$;

-- ---------- perfis_acesso ----------
DO $$
BEGIN
  IF to_regclass('public.perfis_acesso') IS NOT NULL THEN
    ALTER TABLE public.perfis_acesso ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
    UPDATE public.perfis_acesso SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE public.perfis_acesso ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_perfis_acesso_tenant_id ON public.perfis_acesso(tenant_id);
  END IF;
END $$;

-- ---------- usuarios_sistema ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NOT NULL THEN
    ALTER TABLE public.usuarios_sistema ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
    UPDATE public.usuarios_sistema SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE public.usuarios_sistema ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_tenant_id ON public.usuarios_sistema(tenant_id);
    -- remover unicidade só em login (substituir por login+tenant)
    FOR r IN
      SELECT con.conname
      FROM pg_constraint con
      WHERE con.conrelid = 'public.usuarios_sistema'::regclass
        AND con.contype = 'u'
        AND pg_get_constraintdef(con.oid) ILIKE '%login%'
    LOOP
      EXECUTE format('ALTER TABLE public.usuarios_sistema DROP CONSTRAINT %I', r.conname);
    END LOOP;
    DROP INDEX IF EXISTS usuarios_sistema_login_per_tenant;
    CREATE UNIQUE INDEX usuarios_sistema_login_per_tenant ON public.usuarios_sistema(lower(login), tenant_id);
  END IF;
END $$;

-- ---------- usuario_permissoes ----------
DO $$
BEGIN
  IF to_regclass('public.usuario_permissoes') IS NOT NULL THEN
    ALTER TABLE public.usuario_permissoes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
    UPDATE public.usuario_permissoes up SET tenant_id = u.tenant_id
    FROM public.usuarios_sistema u
    WHERE up.usuario_id::text = u.id::text AND up.tenant_id IS NULL;
    UPDATE public.usuario_permissoes SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE public.usuario_permissoes ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_tenant_id ON public.usuario_permissoes(tenant_id);
  END IF;
END $$;

-- ---------- perfil_permissoes ----------
DO $$
BEGIN
  IF to_regclass('public.perfil_permissoes') IS NOT NULL THEN
    ALTER TABLE public.perfil_permissoes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
    UPDATE public.perfil_permissoes pp SET tenant_id = p.tenant_id
    FROM public.perfis_acesso p
    WHERE pp.perfil_id::text = p.id::text AND pp.tenant_id IS NULL;
    UPDATE public.perfil_permissoes SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE public.perfil_permissoes ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_perfil_permissoes_tenant_id ON public.perfil_permissoes(tenant_id);
  END IF;
END $$;

-- ---------- dispositivos_mobile ----------
DO $$
BEGIN
  IF to_regclass('public.dispositivos_mobile') IS NOT NULL THEN
    ALTER TABLE public.dispositivos_mobile ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
    UPDATE public.dispositivos_mobile SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
    ALTER TABLE public.dispositivos_mobile ALTER COLUMN tenant_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_dispositivos_mobile_tenant_id ON public.dispositivos_mobile(tenant_id);
  END IF;
END $$;

-- ---------- iso_pro_snapshot (PK composta id + tenant_id) ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.iso_pro_snapshot') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.iso_pro_snapshot ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
  UPDATE public.iso_pro_snapshot SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
  ALTER TABLE public.iso_pro_snapshot ALTER COLUMN tenant_id SET NOT NULL;
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.iso_pro_snapshot'::regclass AND con.contype = 'p'
  LOOP
    EXECUTE format('ALTER TABLE public.iso_pro_snapshot DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.iso_pro_snapshot ADD PRIMARY KEY (id, tenant_id);
END $$;

-- ---------- iso_pro_relatorio_snapshot ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.iso_pro_relatorio_snapshot') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.iso_pro_relatorio_snapshot ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
  UPDATE public.iso_pro_relatorio_snapshot SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
  ALTER TABLE public.iso_pro_relatorio_snapshot ALTER COLUMN tenant_id SET NOT NULL;
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.iso_pro_relatorio_snapshot'::regclass AND con.contype = 'p'
  LOOP
    EXECUTE format('ALTER TABLE public.iso_pro_relatorio_snapshot DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.iso_pro_relatorio_snapshot ADD PRIMARY KEY (id, tenant_id);
END $$;

-- ---------- desktop_licencas ----------
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.desktop_licencas') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.desktop_licencas ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.iso_pro_tenants(id);
  UPDATE public.desktop_licencas SET tenant_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE tenant_id IS NULL;
  ALTER TABLE public.desktop_licencas ALTER COLUMN tenant_id SET NOT NULL;
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.desktop_licencas'::regclass AND con.contype = 'p'
  LOOP
    EXECUTE format('ALTER TABLE public.desktop_licencas DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.desktop_licencas ADD PRIMARY KEY (license_id, tenant_id);
END $$;

COMMIT;

-- ========== FIM multi_tenant | INÍCIO: 20260207130000_iso_pro_auth_membership ==========

-- I.S.O PRO — Auth ↔ tenant automático
-- 1) `iso_pro_auth_membership`: mapa auth.users → tenant (Custom Access Token Hook).
-- 2) `usuarios_sistema.auth_user_id`: quando preenchido, trigger mantém membership em sync.
-- 3) RPC `iso_pro_set_usuario_auth_link`: só service_role (ex.: Edge Function com segredo).

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

-- ========== FIM setup. Próximo passo: provision_novo_tenant.sql + Hook no Dashboard ==========
