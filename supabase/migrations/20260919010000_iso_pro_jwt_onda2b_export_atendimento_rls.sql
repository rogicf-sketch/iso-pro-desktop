-- Onda 2b (leitura): revoga anon em export/status; alinha RLS atendimento v2 ao JWT.
-- Clientes PC/mobile usam JWT (authenticated). assert_tenant nao protege anon.

BEGIN;

-- ---------- 1) Export / status: so authenticated (+ service_role via bypass) ----------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'iso_pro_export_documentos_itens_page',
        'iso_pro_export_documentos_itens_csv_page',
        'iso_pro_export_documentos_itens_csv_all',
        'iso_pro_export_recebimentos_itens_page',
        'iso_pro_export_atendimentos_itens_page',
        'iso_pro_export_rir_itens_page',
        'iso_pro_export_materiais_page',
        'iso_pro_status_documentos_planejamento_lote',
        'iso_pro_list_audit_log',
        'iso_pro_append_audit_log'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- ---------- 2) Atendimento v2: RLS authenticated-only (sem anon cross-tenant) ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'iso_pro_atendimento_lotes',
    'iso_pro_atendimento_lote_itens',
    'iso_pro_atendimento_eventos',
    'iso_pro_estorno_v2_resultados'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_anon_rw', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_rls', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_rls', t);
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_role',
      t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS
  'I.S.O PRO: onda 2b — export/status sem anon; atendimento v2 RLS authenticated-only.';

COMMIT;
