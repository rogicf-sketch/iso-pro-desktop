-- =============================================================================
-- I.S.O PRO - Cliente 01 (base ja provisionada)
-- =============================================================================
-- Apos `cole_uma_vez_sql_editor_setup_iso_pro.sql` existe o tenant default:
--   slug: default  |  nome tipico: Organizacao principal
-- Este ficheiro NAO cria novo tenant (evita duplicar). Serve para confirmar na base.
--
-- Novas empresas: usar pastas cliente-02, cliente-03, cliente-04 (provision_tenant.sql).
-- =============================================================================

SELECT id, slug, name
FROM public.iso_pro_tenants
ORDER BY name;
