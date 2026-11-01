-- Rollback emergência JWT onda 2 — reabre EXECUTE anon nas RPCs de escrita operacional.
-- Só após incidentes. Preferir corrigir sessão JWT.
-- Nota: peek permanece com anon (excepto se alguém o tiver revogado à parte).

BEGIN;

GRANT EXECUTE ON FUNCTION public.iso_pro_patch_snapshot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_atendimento_comando TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_peek_atendimento_comando TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_registrar_atendimento_mobile TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rir_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_rnc_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_fornecedores_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_equipamentos_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_etiquetas_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_recebimentos_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_inventarios_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_documentos_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_materiais_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_write_configuracoes_sot TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_replace_colaboradores TO anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch TO anon;

COMMIT;
