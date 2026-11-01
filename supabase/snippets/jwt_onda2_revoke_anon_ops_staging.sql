-- =============================================================================
-- JWT onda 2 (STAGING ONLY): revogar EXECUTE anon em RPCs de ESCRITA operacional
-- Manter bootstrap login: iso_pro_resolver_auth_email*
-- Manter peek ACK anon (fallback canteiro; clientes já preferem JWT — onda 2b remove anon)
-- NÃO aplicar em produção sem 7 dias de telemetria JWT-only + smoke campo.
-- Rollback: jwt_onda2_rollback_anon_ops.sql
-- =============================================================================

BEGIN;

-- Escrita / comando (candidatos P0) — SEM peek (excepção documentada)
REVOKE EXECUTE ON FUNCTION public.iso_pro_patch_snapshot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_submit_atendimento_comando FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_registrar_atendimento_mobile FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_rir_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_rnc_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_fornecedores_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_equipamentos_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_etiquetas_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_recebimentos_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_inventarios_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_documentos_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_materiais_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_write_configuracoes_sot FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_replace_colaboradores FROM anon;
REVOKE EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch FROM anon;

-- Garantir authenticated mantém EXECUTE (idempotente se já tiver)
GRANT EXECUTE ON FUNCTION public.iso_pro_patch_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_atendimento_comando TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_peek_atendimento_comando TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_materiais_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch TO authenticated;

COMMIT;

-- Verificação:
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_x
-- FROM pg_proc WHERE proname IN (
--   'iso_pro_patch_snapshot','iso_pro_submit_atendimento_comando',
--   'iso_pro_peek_atendimento_comando','iso_pro_write_documentos_sot'
-- );
-- Esperado: patch/submit/write = false; peek = true
