-- I.S.O PRO — Validação rápida pós db push (20260604150000 + 20260604160000)
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
    'iso_pro_jwt_tenant_id'
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

-- 3) anon não pode SELECT senha (deve falhar ou retornar 0 colunas senha)
-- Se der erro de permissão, está correcto:
-- SELECT senha FROM public.usuarios_sistema LIMIT 1;

-- 4) Login RPC (substitua senha real)
-- SELECT public.iso_pro_autenticar_usuario(
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   'admin',
--   'SUA_SENHA_AQUI',
--   'mobile'
-- );
