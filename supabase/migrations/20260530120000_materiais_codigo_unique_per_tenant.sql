-- Multi-tenant: permitir o mesmo codigo de material em tenants diferentes;
-- unicidade apenas dentro de cada empresa (tenant_id, lower(trim(codigo))).

DO $$
BEGIN
  IF to_regclass('public.materiais') IS NULL THEN
    RAISE NOTICE 'Tabela public.materiais inexistente; migracao ignorada.';
    RETURN;
  END IF;
END $$;

-- Remove unicidade global legada so em codigo (se existir).
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.materiais') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS materiais_codigo_key;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
    WHERE t.relname = 'materiais'
      AND nsp.nspname = 'public'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%codigo%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%tenant_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS materiais_tenant_id_codigo_lower_uidx
  ON public.materiais (tenant_id, lower(trim(codigo)));
