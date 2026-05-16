-- Multi-tenant: permitir o mesmo codigo (ex.: admin) em perfis_acesso por tenant_id.
-- Remove unicidade global só em codigo; impõe unicidade (tenant_id, lower(trim(codigo))).

ALTER TABLE public.perfis_acesso
  DROP CONSTRAINT IF EXISTS perfis_acesso_codigo_key;

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
