-- =============================================================================
-- I.S.O PRO — Corrigir unicidade de materiais.codigo por tenant
-- =============================================================================
-- Execute no SQL Editor se a importacao ou o cadastro falhar com:
--   duplicate key value violates unique constraint "materiais_codigo_key"
--   ou conflito ao criar o indice materiais_tenant_id_codigo_lower_uidx
--
-- Antes de criar o indice, verifique duplicatas dentro do MESMO tenant:
--
--   SELECT tenant_id, lower(trim(codigo)) AS codigo_norm, count(*)
--   FROM public.materiais
--   GROUP BY 1, 2
--   HAVING count(*) > 1;
--
-- Resolva duplicatas (mesclar ou renomear codigos) antes de continuar.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.materiais') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.materiais nao encontrada.';
  END IF;
END $$;

ALTER TABLE public.materiais DROP CONSTRAINT IF EXISTS materiais_codigo_key;

DO $$
DECLARE
  r RECORD;
BEGIN
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
