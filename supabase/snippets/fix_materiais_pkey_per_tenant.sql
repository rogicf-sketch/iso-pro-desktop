-- =============================================================================
-- I.S.O PRO — Corrigir materiais_pkey para multi-tenant
-- =============================================================================
-- Erro ao cadastrar/importar na segunda empresa:
--   duplicate key value violates unique constraint "materiais_pkey"
--
-- Causa: PK legada so em `id`; a empresa nova tentava id=1, 2, 3... ja usados
-- na empresa principal. Apos este script: PK (tenant_id, id).
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.materiais') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.materiais nao encontrada.';
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
