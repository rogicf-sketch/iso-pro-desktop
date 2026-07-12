-- Validação pós 20260711120000 (só leitura)
-- Esperado: políticas *_tenant_rls nas tabelas de escala; assert nas RPCs listadas.

SELECT c.relname AS tabela, p.policyname, p.qual
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN (
    'iso_pro_documentos_planejamento',
    'iso_pro_documento_itens_planejamento',
    'iso_pro_recebimentos',
    'iso_pro_recebimento_itens',
    'iso_pro_inventarios',
    'iso_pro_inventario_itens',
    'iso_pro_rir',
    'iso_pro_rnc'
  )
ORDER BY c.relname, p.policyname;

SELECT p.proname,
  (position('iso_pro_assert_tenant_caller' IN pg_get_functiondef(p.oid)) > 0) AS tem_assert
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'iso_pro_read_snapshot_slices',
    'iso_pro_patch_snapshot',
    'iso_pro_list_documentos_planejamento_page',
    'iso_pro_list_recebimentos_page',
    'iso_pro_list_materiais_page',
    'iso_pro_operacao_contagens',
    'iso_pro_registrar_atendimento_mobile'
  )
ORDER BY p.proname;
