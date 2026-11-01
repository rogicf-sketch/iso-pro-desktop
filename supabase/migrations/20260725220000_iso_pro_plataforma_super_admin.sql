-- Super-admin de plataforma: governa licenças desktop (e sede) a partir do tenant default.
-- Flag em usuarios_sistema; só faz sentido no tenant principal (00000000-…-0001).

DO $$
BEGIN
  IF to_regclass('public.usuarios_sistema') IS NULL THEN
    RAISE NOTICE 'iso_pro_plataforma_super_admin: usuarios_sistema inexistente; omitido.';
    RETURN;
  END IF;

  ALTER TABLE public.usuarios_sistema
    ADD COLUMN IF NOT EXISTS plataforma_super_admin boolean NOT NULL DEFAULT false;

  COMMENT ON COLUMN public.usuarios_sistema.plataforma_super_admin IS
    'Quando true no tenant default: pode emitir/listar/revogar licenças desktop para qualquer tenant (Edge iso_pro_desktop_license).';

  -- Bootstrap: admins activos do tenant default passam a super-admin (operador da sede).
  IF to_regclass('public.perfis_acesso') IS NOT NULL THEN
    UPDATE public.usuarios_sistema AS u
    SET plataforma_super_admin = true
    FROM public.perfis_acesso AS p
    WHERE u.perfil_id = p.id
      AND u.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND u.ativo IS TRUE
      AND lower(coalesce(p.codigo, '')) = 'admin'
      AND coalesce(u.plataforma_super_admin, false) IS FALSE;
  END IF;
END $$;
