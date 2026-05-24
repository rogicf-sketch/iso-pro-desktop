-- =============================================================================
-- I.S.O PRO — Auditoria RLS (somente leitura)
-- =============================================================================
-- Executar no SQL Editor do Supabase (produção ou staging).
-- Não altera dados. Use antes do go-live e após cada migração de schema.
--
-- Tabelas críticas para cadastro, recebimento, planejamento, atendimento e RIR
-- (dados vivem sobretudo em iso_pro_snapshot; cadastros podem ter tabelas próprias).
-- =============================================================================

-- 1) Tabelas public.* sem RLS activo
SELECT
  n.nspname AS schema,
  c.relname AS tabela,
  c.relrowsecurity AS rls_ligado,
  c.relforcerowsecurity AS rls_forcado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
ORDER BY c.relrowsecurity ASC, c.relname;

-- 2) Políticas por tabela (resumo)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text AS roles,
  cmd,
  qual IS NOT NULL AS tem_using,
  with_check IS NOT NULL AS tem_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3) Foco — tabelas I.S.O PRO mais sensíveis
SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_ligado,
  COUNT(p.policyname) AS num_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'iso_pro_snapshot',
    'iso_pro_relatorio_snapshot',
    'iso_pro_tenants',
    'iso_pro_auth_membership',
    'dispositivos_mobile',
    'desktop_licencas',
    'materiais',
    'usuarios_sistema',
    'perfis_acesso',
    'usuario_permissoes',
    'perfil_permissoes'
  )
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- 4) Alerta: iso_pro_snapshot sem RLS ou sem políticas
SELECT
  CASE
    WHEN NOT c.relrowsecurity THEN 'CRITICO: RLS desligado'
    WHEN COUNT(p.policyname) = 0 THEN 'ALERTA: RLS ligado mas sem policies'
    ELSE 'OK: tem policies'
  END AS status,
  c.relname AS tabela,
  COUNT(p.policyname) AS num_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname = 'iso_pro_snapshot'
GROUP BY c.relname, c.relrowsecurity;

-- 5) Políticas que permitem role anon (rever em produção)
SELECT tablename, policyname, roles::text, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text ILIKE '%anon%'
ORDER BY tablename, policyname;

-- Checklist manual após correr este script:
-- [ ] iso_pro_snapshot: RLS ON + policies por tenant_id (JWT ou equivalente)
-- [ ] dispositivos_mobile: só tenant/admin altera autorização
-- [ ] Nenhuma policy anon com USING (true) em tabelas de negócio
-- [ ] Testar com utilizador de outro tenant: SELECT/UPDATE deve falhar
