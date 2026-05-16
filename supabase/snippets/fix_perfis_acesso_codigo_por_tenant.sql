-- =============================================================================
-- I.S.O PRO — Corrigir unicidade de perfis_acesso.codigo por tenant
-- =============================================================================
-- Erro típico ao correr provision_novo_tenant.sql:
--   duplicate key value violates unique constraint "perfis_acesso_codigo_key"
--   Key (codigo)=(admin) already exists.
--
-- A base legada tinha UNIQUE só em `codigo`; com vários tenants cada um precisa do seu
-- perfil `admin`, `planejamento`, etc.
--
-- Executar UMA vez no SQL Editor (Role: postgres), ANTES do provision_novo_tenant.
-- =============================================================================

ALTER TABLE public.perfis_acesso
  DROP CONSTRAINT IF EXISTS perfis_acesso_codigo_key;

-- Opcional: outro nome de constraint em bases antigas
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
    WHERE t.relname = 'perfis_acesso'
      AND nsp.nspname = 'public'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%codigo%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%tenant_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.perfis_acesso DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS perfis_acesso_tenant_id_codigo_lower_uidx
  ON public.perfis_acesso (tenant_id, lower(trim(codigo)));
