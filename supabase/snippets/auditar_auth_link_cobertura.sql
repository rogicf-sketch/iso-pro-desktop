-- I.S.O PRO — Cobertura Auth link (só leitura)
-- SQL Editor do projecto de produção. Tenant default abaixo.

-- Resumo global
SELECT
  COUNT(*) FILTER (WHERE coalesce(ativo, false)) AS activos,
  COUNT(*) FILTER (WHERE coalesce(ativo, false) AND auth_user_id IS NOT NULL) AS activos_com_auth,
  COUNT(*) FILTER (WHERE coalesce(ativo, false) AND auth_user_id IS NULL) AS activos_sem_auth,
  (SELECT COUNT(*) FROM public.iso_pro_auth_membership) AS memberships,
  (SELECT COUNT(*) FROM auth.users) AS auth_users
FROM public.usuarios_sistema
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- Lista: quem ainda entra só por RPC (authPath=rpc_only)
SELECT
  u.id::text AS usuario_id,
  u.login,
  u.nome,
  coalesce(pa.codigo, u.perfil_id::text) AS perfil,
  CASE WHEN u.auth_user_id IS NULL THEN 'rpc_only' ELSE 'jwt_ready' END AS caminho_esperado
FROM public.usuarios_sistema AS u
LEFT JOIN public.perfis_acesso AS pa
  ON pa.tenant_id = u.tenant_id AND pa.id::text = u.perfil_id::text
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND coalesce(u.ativo, false) = true
ORDER BY (u.auth_user_id IS NULL) DESC, u.login;

-- Membership órfã / desalinhada (não deveria existir)
SELECT m.auth_user_id, m.tenant_id, u.login
FROM public.iso_pro_auth_membership AS m
LEFT JOIN public.usuarios_sistema AS u
  ON u.auth_user_id = m.auth_user_id AND u.tenant_id = m.tenant_id
WHERE u.id IS NULL;
