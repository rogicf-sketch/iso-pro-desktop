-- Hardening: search_path fixo nas funções flagged pelo Security Advisor (0011).
-- Não altera lógica — só fecha mutable search_path.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS reg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'set_updated_at',
        'iso_pro_find_jsonb_array_element_by_id',
        'iso_pro_jsonb_upsert_one_in_array_by_id',
        'iso_pro_num_from_jsonb',
        'iso_pro_jsonb_merge_array_by_id',
        'iso_pro_merge_documento_planejamento_atendimento',
        'iso_pro_jsonb_merge_documentos_atendimento_by_id',
        'iso_pro_assert_atendimento_documentos_progresso'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public', r.reg);
  END LOOP;
END $$;
