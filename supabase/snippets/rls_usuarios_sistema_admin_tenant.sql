-- =============================================================================
-- I.S.O PRO — EXEMPLO: RLS em `usuarios_sistema` com JWT + "só admin do tenant"
-- =============================================================================
-- Pré-requisitos (ver `rls_auth_jwt_tenant_exemplo.sql`):
--   - `public.iso_pro_jwt_tenant_id()` (ou equivalente) a ler tenant_id do JWT.
--   - Coluna `usuarios_sistema.auth_user_id` preenchida e login via Supabase Auth.
--   - Políticas que removem acesso `anon` directo a esta tabela quando migrares o cliente.
--
-- Este ficheiro NÃO é uma migração: copiar para uma migração nova quando o web/desktop
-- deixarem de depender da anon key para CRUD em `usuarios_sistema`.
--
-- Modelo de leitura: qualquer utilizador autenticado do tenant vê utilizadores do mesmo tenant.
-- Modelo de escrita (INSERT/UPDATE/DELETE): apenas quem "administra utilizadores" no tenant,
-- espelhando a lógica de `iso_pro_usuario_administra_utilizadores` mas sem senha em SQL
-- (usa `auth.uid()` ↔ `auth_user_id`).
-- =============================================================================

-- Requer `iso_pro_jwt_tenant_id()` já criada (snippet `rls_auth_jwt_tenant_exemplo.sql`).

CREATE OR REPLACE FUNCTION public.iso_pro_jwt_pode_administrar_utilizadores()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS u
    WHERE u.auth_user_id = auth.uid()
      AND u.tenant_id = public.iso_pro_jwt_tenant_id()
      AND public.iso_pro_jwt_tenant_id() IS NOT NULL
      AND coalesce(u.ativo, false) = true
      AND (
        EXISTS (
          SELECT 1
          FROM public.perfis_acesso AS pa
          WHERE pa.tenant_id = u.tenant_id
            AND pa.id::text = u.perfil_id::text
            AND lower(trim(pa.codigo)) = 'admin'
        )
        OR EXISTS (
          SELECT 1
          FROM public.usuario_permissoes AS up
          WHERE up.tenant_id = u.tenant_id
            AND up.usuario_id::text = u.id::text
            AND lower(trim(up.modulo)) = 'usuarios'
            AND lower(trim(up.acao)) = 'administrar'
            AND coalesce(up.permitido, false) = true
        )
      )
  );
$$;

COMMENT ON FUNCTION public.iso_pro_jwt_pode_administrar_utilizadores() IS
  'JWT: utilizador actual (auth.uid) com linha em usuarios_sistema do tenant e perfil admin ou perm usuarios:administrar.';

-- REVOKE/GRANT conforme política do projecto; exemplo mínimo:
-- REVOKE ALL ON FUNCTION public.iso_pro_jwt_pode_administrar_utilizadores() FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.iso_pro_jwt_pode_administrar_utilizadores() TO authenticated;

-- ---------------------------------------------------------------------------
-- Políticas exemplo (descomentar na migração real)
-- ---------------------------------------------------------------------------
--
-- ALTER TABLE public.usuarios_sistema ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS usuarios_sistema_select_tenant ON public.usuarios_sistema;
-- CREATE POLICY usuarios_sistema_select_tenant
--   ON public.usuarios_sistema
--   FOR SELECT
--   TO authenticated
--   USING (tenant_id = public.iso_pro_jwt_tenant_id());
--
-- DROP POLICY IF EXISTS usuarios_sistema_insert_admin ON public.usuarios_sistema;
-- CREATE POLICY usuarios_sistema_insert_admin
--   ON public.usuarios_sistema
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     tenant_id = public.iso_pro_jwt_tenant_id()
--     AND public.iso_pro_jwt_pode_administrar_utilizadores()
--   );
--
-- DROP POLICY IF EXISTS usuarios_sistema_update_admin ON public.usuarios_sistema;
-- CREATE POLICY usuarios_sistema_update_admin
--   ON public.usuarios_sistema
--   FOR UPDATE
--   TO authenticated
--   USING (tenant_id = public.iso_pro_jwt_tenant_id())
--   WITH CHECK (
--     tenant_id = public.iso_pro_jwt_tenant_id()
--     AND public.iso_pro_jwt_pode_administrar_utilizadores()
--   );
--
-- DROP POLICY IF EXISTS usuarios_sistema_delete_admin ON public.usuarios_sistema;
-- CREATE POLICY usuarios_sistema_delete_admin
--   ON public.usuarios_sistema
--   FOR DELETE
--   TO authenticated
--   USING (
--     tenant_id = public.iso_pro_jwt_tenant_id()
--     AND public.iso_pro_jwt_pode_administrar_utilizadores()
--   );
--
-- service_role continua a contornar RLS para manutenção / Edge Functions.
