-- =============================================================================
-- I.S.O PRO — EXEMPLO de RLS por tenant com Supabase Auth + JWT (referência)
-- =============================================================================
-- NÃO aplicar em produção até:
--   1) Migrar login para Supabase Auth (email/password ou magic link + Edge Function).
--   2) Injetar `tenant_id` no JWT — `custom_access_token_hook_iso_pro.sql` ou Edge em
--      `custom_access_token_hook_edge_exemplo.ts` (também `raw_app_meta_data` se preferires).
--   3) Remover ou endurecer políticas que permitem `anon` ler/escrever linhas de todas
--      as empresas com a anon key (o modelo actual da app usa anon + filtro no cliente).
--
-- Este ficheiro é um esboço: copiar trechos para uma migração nova quando estiveres pronto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onde costuma viver o tenant no JWT (escolhe UMA estratégia e alinha com o Hook):
--
-- A) Claim no topo do payload (Hook devolve claims merged):
--      auth.jwt() ->> 'tenant_id'
--
-- B) Dentro de app_metadata:
--      auth.jwt() -> 'app_metadata' ->> 'tenant_id'
--
-- C) user_metadata:
--      auth.jwt() -> 'user_metadata' ->> 'tenant_id'
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.iso_pro_jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT NULLIF(btrim(coalesce(
    auth.jwt() ->> 'tenant_id',
    auth.jwt() -> 'app_metadata' ->> 'tenant_id',
    auth.jwt() -> 'user_metadata' ->> 'tenant_id',
    ''
  )), '')::uuid;
$$;

COMMENT ON FUNCTION public.iso_pro_jwt_tenant_id() IS
  'Lê tenant_id do JWT (várias localizações possíveis). Retorna NULL se ausente/ inválido.';

-- Exemplo: política para `public.materiais` (repetir padrão em cada tabela com tenant_id).
--
-- ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS materiais_select_own_tenant ON public.materiais;
-- CREATE POLICY materiais_select_own_tenant
--   ON public.materiais
--   FOR SELECT
--   TO authenticated
--   USING (tenant_id = public.iso_pro_jwt_tenant_id());
--
-- DROP POLICY IF EXISTS materiais_insert_own_tenant ON public.materiais;
-- CREATE POLICY materiais_insert_own_tenant
--   ON public.materiais
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (tenant_id = public.iso_pro_jwt_tenant_id());
--
-- DROP POLICY IF EXISTS materiais_update_own_tenant ON public.materiais;
-- CREATE POLICY materiais_update_own_tenant
--   ON public.materiais
--   FOR UPDATE
--   TO authenticated
--   USING (tenant_id = public.iso_pro_jwt_tenant_id())
--   WITH CHECK (tenant_id = public.iso_pro_jwt_tenant_id());
--
-- DROP POLICY IF EXISTS materiais_delete_own_tenant ON public.materiais;
-- CREATE POLICY materiais_delete_own_tenant
--   ON public.materiais
--   FOR DELETE
--   TO authenticated
--   USING (tenant_id = public.iso_pro_jwt_tenant_id());

-- Tabelas típicas do multi-tenant actual: materiais, perfis_acesso, usuarios_sistema,
-- usuario_permissoes, perfil_permissoes, dispositivos_mobile, iso_pro_snapshot,
-- iso_pro_relatorio_snapshot, desktop_licencas.

-- iso_pro_tenants: normalmente só SELECT da linha do próprio tenant, ou SELECT todas
-- para super-admin via role/service role.

-- -----------------------------------------------------------------------------
-- Notas de segurança
-- -----------------------------------------------------------------------------
-- * `iso_pro_jwt_tenant_id()` é SECURITY INVOKER: corre com o utilizador da sessão.
-- * Garantir que `tenant_id` no JWT só é definido no servidor (Hook), nunca confiar
--   num valor editável só pelo cliente sem validação (ex.: comparar com linha em
--   `usuarios_sistema` ou membership table).
-- * Funções SECURITY DEFINER só se precisares de bypass controlado; fixar search_path.
-- * Revogar políticas largas em `anon` nas tabelas de dados antes de confiar no RLS.
