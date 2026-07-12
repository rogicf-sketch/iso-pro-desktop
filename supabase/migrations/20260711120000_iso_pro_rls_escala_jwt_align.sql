-- P0 JWT/RLS: alinha tabelas de escala (jul/2026) ao RLS híbrido + assert nas RPCs.
-- Compatível com anon actual; em authenticated exige claim tenant_id = p_tenant_id.
BEGIN;

-- ---------- 1) Políticas tenant_rls nas tabelas de escala ----------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'iso_pro_documentos_planejamento',
    'iso_pro_documento_itens_planejamento',
    'iso_pro_recebimentos',
    'iso_pro_recebimento_itens',
    'iso_pro_inventarios',
    'iso_pro_inventario_itens',
    'iso_pro_rir',
    'iso_pro_rnc'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_anon_rw', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_rls', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated '
        || 'USING (public.iso_pro_rls_tenant_row_allowed(tenant_id)) '
        || 'WITH CHECK (public.iso_pro_rls_tenant_row_allowed(tenant_id))',
        t || '_tenant_rls',
        t
      );
    END IF;
  END LOOP;
END $$;

-- service_role continua com bypass (Edge / admin) — nome alinhado às migrações jul/2026
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'iso_pro_documentos_planejamento',
    'iso_pro_documento_itens_planejamento',
    'iso_pro_recebimentos',
    'iso_pro_recebimento_itens',
    'iso_pro_inventarios',
    'iso_pro_inventario_itens',
    'iso_pro_rir',
    'iso_pro_rnc'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ---------- 2) Inject iso_pro_assert_tenant_caller nas RPCs críticas ----------
-- Só a 1.ª ocorrência de BEGIN no corpo (sem flag g) — evita BEGIN aninhados.
DO $$
DECLARE
  r record;
  def text;
  new_def text;
  marker text := 'PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);';
  allow text[] := ARRAY[
    'iso_pro_read_snapshot_slices',
    'iso_pro_patch_snapshot',
    'iso_pro_snapshot_stats',
    'iso_pro_upsert_documentos_planejamento_lote',
    'iso_pro_sync_documentos_planejamento_from_snapshot',
    'iso_pro_list_documentos_planejamento_resumo',
    'iso_pro_search_documentos_planejamento',
    'iso_pro_read_documento_planejamento',
    'iso_pro_list_documentos_pendencia_material',
    'iso_pro_list_documentos_planejamento_page',
    'iso_pro_list_documentos_planejamento_ids',
    'iso_pro_aplicar_progresso_documento_tabelas',
    'iso_pro_espelhar_documentos_patch_nas_tabelas',
    'iso_pro_registrar_atendimento_mobile',
    'iso_pro_operacao_contagens',
    'iso_pro_sum_quantidade_atendida_por_codigo',
    'iso_pro_list_documentos_pendentes_atendimento',
    'iso_pro_upsert_recebimentos_lote',
    'iso_pro_sync_recebimentos_from_snapshot',
    'iso_pro_delete_recebimentos',
    'iso_pro_list_recebimentos_page',
    'iso_pro_list_recebimentos_ids',
    'iso_pro_read_recebimento',
    'iso_pro_list_materiais_page',
    'iso_pro_upsert_inventarios_lote',
    'iso_pro_sync_inventarios_from_snapshot',
    'iso_pro_list_inventarios_page',
    'iso_pro_read_inventario',
    'iso_pro_upsert_rir_lote',
    'iso_pro_upsert_rnc_lote',
    'iso_pro_sync_rir_from_snapshot',
    'iso_pro_sync_rnc_from_snapshot',
    'iso_pro_delete_rir',
    'iso_pro_list_rir_page',
    'iso_pro_list_rnc_page'
  ];
BEGIN
  IF to_regprocedure('public.iso_pro_assert_tenant_caller(uuid)') IS NULL THEN
    RAISE EXCEPTION 'iso_pro_assert_tenant_caller em falta — aplique 20260706230000 antes.';
  END IF;

  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (allow)
      AND p.prokind = 'f'
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position(marker IN def) > 0 THEN
      CONTINUE;
    END IF;
    IF def !~* 'LANGUAGE plpgsql' THEN
      CONTINUE;
    END IF;
    IF pg_get_function_identity_arguments(r.oid) !~* '^p_tenant_id uuid' THEN
      CONTINUE;
    END IF;

    new_def := regexp_replace(
      def,
      '(AS \$[a-zA-Z0-9_]*\$[\s\S]*?\mBEGIN\M\s)',
      E'\\1  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);\n',
      ''
    );

    IF new_def IS DISTINCT FROM def THEN
      EXECUTE new_def;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.iso_pro_assert_tenant_caller(uuid) IS
  'RLS Fase 3+/P0: em role authenticated exige claim tenant_id = p_tenant_id (nunca confiar só no payload).';

COMMIT;
