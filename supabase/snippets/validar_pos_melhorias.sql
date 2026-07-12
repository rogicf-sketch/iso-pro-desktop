-- I.S.O PRO — Validação rápida pós db push (20260604150000 + 20260604160000 + 20260607120000)
-- Executar no SQL Editor do Supabase.

-- 1) Funções de segurança activas
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'iso_pro_autenticar_usuario',
    'iso_pro_refresh_usuario_sessao',
    'iso_pro_criar_token_operacional',
    'custom_access_token_hook',
    'iso_pro_jwt_tenant_id',
    'iso_pro_read_snapshot_slices',
    'iso_pro_patch_snapshot',
    'iso_pro_snapshot_stats',
    'iso_pro_rls_tenant_row_allowed',
    'iso_pro_list_atendimento_comandos',
    'iso_pro_assert_tenant_caller',
    'iso_pro_resolver_auth_email_sessao',
    'iso_pro_auditar_rls_jwt_estado'
  )
ORDER BY routine_name;

-- 2) RLS + policies em iso_pro_snapshot
SELECT
  c.relrowsecurity AS rls_ligado,
  COUNT(p.policyname) AS num_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public' AND c.relname = 'iso_pro_snapshot'
GROUP BY c.relrowsecurity;

-- 2b) Membership JWT (0 até ligar utilizadores em Utilizadores > Supabase Auth)
SELECT COUNT(*) AS memberships FROM public.iso_pro_auth_membership;
SELECT COUNT(*) AS auth_users FROM auth.users;

-- 3) anon não pode SELECT senha (deve falhar ou retornar 0 colunas senha)
-- Se der erro de permissão, está correcto:
-- SELECT senha FROM public.usuarios_sistema LIMIT 1;

-- 3b) Tenants + utilizadores activos (para obter tenant_id e usuario_id)
-- SELECT id, slug, name FROM public.iso_pro_tenants ORDER BY created_at;
-- SELECT u.tenant_id, u.id::text AS usuario_id, u.login, u.nome, pa.codigo AS perfil
-- FROM public.usuarios_sistema AS u
-- LEFT JOIN public.perfis_acesso AS pa ON pa.tenant_id = u.tenant_id AND pa.id::text = u.perfil_id::text
-- WHERE coalesce(u.ativo, false) = true ORDER BY u.tenant_id, u.login;

-- 4) Login RPC (substitua senha real; NULL no 4.º arg. = sem exigir módulo)
-- SELECT jsonb_pretty(public.iso_pro_autenticar_usuario(
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   'admin',
--   'SUA_SENHA_AQUI',
--   NULL
-- ));

-- 5) Refresh sessão (substitua usuario_id real do passo 3b)
-- SELECT jsonb_pretty(public.iso_pro_refresh_usuario_sessao(
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   'UUID_DO_UTILIZADOR'
-- ));
