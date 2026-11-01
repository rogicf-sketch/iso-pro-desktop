-- I.S.O PRO — RLS fail-closed nas tabelas sensíveis (pós JWT onda 2).
--
-- Problema: iso_pro_rls_tenant_row_allowed() permitia `anon` com qualquer
-- tenant_id NOT NULL → chave anon do frontend lia/escrevia snapshot/materiais/etc.
--
-- Solução:
--   1) Helper híbrido passa a negar anon (authenticated exige JWT tenant).
--   2) Políticas das tabelas sensíveis: só `authenticated` (+ service_role bypass).
--   3) REVOKE ALL … FROM anon nessas tabelas.
--
-- Mantém (bootstrap login):
--   - EXECUTE anon em iso_pro_resolver_auth_email_sessao (SECURITY DEFINER)
--   - peek atendimento anon (onda 2b RPC — fora deste ficheiro)
--
-- Smoke: npm run jwt:tabelas-rls-smoke
-- Rollback: supabase/snippets/jwt_tabelas_rls_rollback_anon_compativel.sql

BEGIN;

-- ---------- 1) Helper: anon = false ----------
CREATE OR REPLACE FUNCTION public.iso_pro_rls_tenant_row_allowed(p_row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN true
    WHEN auth.role() = 'authenticated' THEN
      p_row_tenant_id IS NOT NULL
      AND p_row_tenant_id = public.iso_pro_jwt_tenant_id()
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_rls_tenant_row_allowed(uuid) IS
  'RLS fail-closed: service_role ok; authenticated exige JWT tenant_id; anon sempre false (2026-10-25).';

-- ---------- 2) Tabelas sensíveis: authenticated-only + service_role ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'iso_pro_snapshot',
    'iso_pro_relatorio_snapshot',
    'usuarios_sistema',
    'dispositivos_mobile',
    'desktop_licencas',
    'materiais',
    'perfis_acesso',
    'usuario_permissoes',
    'perfil_permissoes',
    'iso_pro_atendimento_comandos',
    'iso_pro_documentos_planejamento',
    'iso_pro_documento_itens_planejamento',
    'iso_pro_recebimentos',
    'iso_pro_recebimento_itens',
    'iso_pro_inventarios',
    'iso_pro_inventario_itens',
    'iso_pro_rir',
    'iso_pro_rnc',
    'colaboradores',
    'fornecedores',
    'equipamentos',
    'iso_pro_escala_outbox'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Políticas legadas / híbridas
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_anon_rw', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_rls', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_rls', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role', t);

    IF to_regprocedure('public.iso_pro_rls_tenant_authenticated_only(uuid)') IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
        || 'USING (public.iso_pro_rls_tenant_authenticated_only(tenant_id)) '
        || 'WITH CHECK (public.iso_pro_rls_tenant_authenticated_only(tenant_id))',
        t || '_authenticated_rls',
        t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
        || 'USING (public.iso_pro_rls_tenant_row_allowed(tenant_id)) '
        || 'WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id))',
        t || '_authenticated_rls',
        t
      );
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_role',
      t
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      t
    );
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS
  'I.S.O PRO: RLS tabelas sensíveis authenticated-only (anon negado) — 2026-10-25.';

COMMIT;
