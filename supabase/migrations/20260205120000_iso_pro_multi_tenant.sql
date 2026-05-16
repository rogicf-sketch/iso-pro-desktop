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
