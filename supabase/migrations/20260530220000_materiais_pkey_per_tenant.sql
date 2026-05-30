-- Multi-tenant: permitir o mesmo id numerico de material em tenants diferentes.
-- Antes: PRIMARY KEY (id) — segunda empresa falhava com materiais_pkey ao importar/cadastrar.
-- Depois: PRIMARY KEY (tenant_id, id) — cada empresa tem sequencia propria (1, 2, 3...).

DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.materiais') IS NULL THEN
    RAISE NOTICE 'Tabela public.materiais inexistente; migracao ignorada.';
    RETURN;
  END IF;

  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.materiais'::regclass
      AND con.contype = 'p'
  LOOP
    EXECUTE format('ALTER TABLE public.materiais DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.materiais ADD PRIMARY KEY (tenant_id, id);
END $$;
