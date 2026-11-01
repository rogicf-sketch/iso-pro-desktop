-- Staging/enterprise: agregação de 300k itens precisa de timeout > default PostgREST (~8s).
-- Sem isto o mobile JWT falha e o Atendimento fica com estoque 0.

ALTER FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid)
  SET statement_timeout = '120s';

ALTER FUNCTION public.iso_pro_sum_quantidade_atendida_por_codigo(uuid)
  SET statement_timeout = '120s';

COMMENT ON FUNCTION public.iso_pro_sum_quantidade_recebida_por_codigo(uuid) IS
  'Mapa codigo → quantidade recebida (regras buildSaldoMap). Prefer tabelas SoT; fallback snapshot. statement_timeout 120s (escala 100k+).';
