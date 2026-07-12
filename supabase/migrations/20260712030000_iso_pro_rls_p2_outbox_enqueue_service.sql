-- P2 RLS/outbox: enqueue* só via trigger DEFINER / service_role.
-- Clientes (desktop/mobile) usam apenas flush + status.

BEGIN;

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'iso_pro_escala_outbox_enqueue',
    'iso_pro_escala_outbox_enqueue_from_patch'
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

-- Garantir superfície pública da outbox (clientes)
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
        'iso_pro_escala_outbox_status'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.reg);
  END LOOP;
END $$;

COMMIT;
