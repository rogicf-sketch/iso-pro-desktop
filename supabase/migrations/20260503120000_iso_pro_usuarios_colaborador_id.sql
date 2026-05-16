-- I.S.O PRO — coluna opcional `colaborador_id` em `usuarios_sistema`.
-- Conteúdo alinhado a `scripts/supabase-usuarios-colaborador-id.sql` (promovido a migração oficial).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NULL THEN
    RAISE NOTICE 'iso_pro_usuarios_colaborador_id: tabela usuarios_sistema inexistente; omitido.';
    RETURN;
  END IF;

  ALTER TABLE public.usuarios_sistema ADD COLUMN IF NOT EXISTS colaborador_id text NULL;

  COMMENT ON COLUMN public.usuarios_sistema.colaborador_id IS
    'Id opcional do registo em colaboradores (snapshot); null para contas tecnicas ou externas.';

  CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_colaborador_id
    ON public.usuarios_sistema (colaborador_id)
    WHERE colaborador_id IS NOT NULL;
END $$;

COMMIT;
