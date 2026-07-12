-- P1 RLS cirúrgico: mobile_logs insert com WITH CHECK real + outbox
-- RPCs internas (claim/complete/fail/process_one) só service_role.
-- Clientes continuam com flush / status / enqueue (já usados pela app).

BEGIN;

-- ---------- 1) mobile_logs_acesso ----------
DO $$
BEGIN
  IF to_regclass('public.mobile_logs_acesso') IS NULL THEN
    RAISE NOTICE 'mobile_logs_acesso ausente — skip';
    RETURN;
  END IF;

  -- Ninguém no cliente lê esta tabela (só insert no mobile)
  DROP POLICY IF EXISTS mobile_logs_acesso_select_anon ON public.mobile_logs_acesso;
  DROP POLICY IF EXISTS mobile_logs_acesso_insert_anon ON public.mobile_logs_acesso;

  CREATE POLICY mobile_logs_acesso_insert_app
    ON public.mobile_logs_acesso
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      device_id IS NOT NULL
      AND length(btrim(device_id)) >= 8
      AND evento IS NOT NULL
      AND length(btrim(evento)) > 0
      AND length(COALESCE(usuario_login, '')) <= 200
      AND length(COALESCE(detalhe, '')) <= 2000
    );

  -- Leitura só service_role / SQL editor (ops)
  DROP POLICY IF EXISTS mobile_logs_acesso_service_select ON public.mobile_logs_acesso;
  CREATE POLICY mobile_logs_acesso_service_select
    ON public.mobile_logs_acesso
    FOR SELECT
    TO service_role
    USING (true);
END $$;

-- ---------- 2) Outbox: RPCs internas só service_role ----------
DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'iso_pro_escala_outbox_claim',
    'iso_pro_escala_outbox_complete',
    'iso_pro_escala_outbox_fail',
    'iso_pro_escala_outbox_process_one'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS reg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (targets)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.reg);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.reg);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.reg);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.reg);
  END LOOP;
END $$;

-- flush continua DEFINER e chama process_one internamente — re-grant flush a clientes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS reg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'iso_pro_flush_escala_outbox',
        'iso_pro_escala_outbox_status',
        'iso_pro_escala_outbox_enqueue',
        'iso_pro_escala_outbox_enqueue_from_patch'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.reg);
  END LOOP;
END $$;

COMMIT;
