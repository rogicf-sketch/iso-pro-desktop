-- PostgREST: embed usuarios_sistema → usuario_permissoes exige FK no schema cache.
-- Sem isto a UI Usuários falha com "Could not find a relationship between ...".

BEGIN;

-- Limpa órfãos antes da FK (permissoes sem utilizador).
DELETE FROM public.usuario_permissoes AS up
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuarios_sistema AS u WHERE u.id = up.usuario_id
);

DO $$
BEGIN
  IF to_regclass('public.usuario_permissoes') IS NULL
     OR to_regclass('public.usuarios_sistema') IS NULL THEN
    RAISE NOTICE 'iso_pro_usuario_permissoes_fk: tabelas ausentes; omitido.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'usuario_permissoes'
      AND c.contype = 'f'
      AND c.conname = 'usuario_permissoes_usuario_id_fkey'
  ) THEN
    ALTER TABLE public.usuario_permissoes
      ADD CONSTRAINT usuario_permissoes_usuario_id_fkey
      FOREIGN KEY (usuario_id)
      REFERENCES public.usuarios_sistema (id)
      ON DELETE CASCADE;
  END IF;
END
$$;

COMMENT ON CONSTRAINT usuario_permissoes_usuario_id_fkey ON public.usuario_permissoes IS
  'FK para PostgREST embed: usuarios_sistema.select(..., usuario_permissoes(...)).';

-- Mesmo padrão: perfil_permissoes → perfis_acesso (lista de perfis na UI).
DELETE FROM public.perfil_permissoes AS pp
WHERE NOT EXISTS (
  SELECT 1 FROM public.perfis_acesso AS p WHERE p.id = pp.perfil_id
);

DO $$
BEGIN
  IF to_regclass('public.perfil_permissoes') IS NULL
     OR to_regclass('public.perfis_acesso') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'perfil_permissoes'
      AND c.contype = 'f'
      AND c.conname = 'perfil_permissoes_perfil_id_fkey'
  ) THEN
    ALTER TABLE public.perfil_permissoes
      ADD CONSTRAINT perfil_permissoes_perfil_id_fkey
      FOREIGN KEY (perfil_id)
      REFERENCES public.perfis_acesso (id)
      ON DELETE CASCADE;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
