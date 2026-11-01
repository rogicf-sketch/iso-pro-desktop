-- JWT onda 2 (LIVE): revogar EXECUTE de `anon` em RPCs de ESCRITA operacional.
-- Congela em migration o que já estava em snippet (evita regressão no `db push`).
--
-- Mantém:
--   - bootstrap login (iso_pro_resolver_auth_email*)
--   - peek ACK com anon (fallback canteiro; onda 2b remove anon do peek)
--
-- Pré-requisitos (já cumpridos na janela Ago/2026):
--   PC ≥ 0.1.247 · mobile ≥ 1.0.114 · gateway Confirmar JWT-only · smoke 42501
--
-- Rollback emergência: supabase/snippets/jwt_onda2_rollback_anon_ops.sql
-- Verificação: npm run jwt:onda2-smoke

BEGIN;

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

-- authenticated mantém EXECUTE (idempotente)
GRANT EXECUTE ON FUNCTION public.iso_pro_patch_snapshot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_atendimento_comando TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_registrar_atendimento_mobile TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rir_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rnc_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_fornecedores_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_equipamentos_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_etiquetas_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_recebimentos_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_inventarios_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_documentos_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_materiais_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_configuracoes_sot TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_replace_colaboradores TO authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch TO authenticated;

-- Peek: anon de propósito (onda 2b)
GRANT EXECUTE ON FUNCTION public.iso_pro_peek_atendimento_comando TO authenticated, anon;

COMMIT;

COMMENT ON FUNCTION public.iso_pro_peek_atendimento_comando IS
  'ACK peek — EXECUTE anon mantido até onda 2b (telemetria sem fallback JWT).';
