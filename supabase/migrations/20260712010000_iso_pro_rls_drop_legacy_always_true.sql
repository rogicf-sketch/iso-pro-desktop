-- P0 RLS cirúrgico: remove policies legadas USING/WITH CHECK (true) que OR-bypass
-- das policies *_tenant_rls (híbrido anon + JWT).
-- Mantém SELECT de login (*_read_login / usuarios_sistema_select_login).
-- Revoga EXECUTE de anon/authenticated em RPCs só-ops / worker / trigger.

BEGIN;

-- ---------- 1) Drop legacy always-true CRUD (public) nas tabelas com tenant_rls ----------
DO $$
DECLARE
  t text;
  op text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'desktop_licencas',
    'dispositivos_mobile',
    'iso_pro_relatorio_snapshot',
    'iso_pro_snapshot',
    'materiais',
    'perfil_permissoes',
    'perfis_acesso',
    'usuario_permissoes',
    'usuarios_sistema'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOREACH op IN ARRAY ARRAY['select', 'insert', 'update', 'delete']
    LOOP
      pol := t || '_' || op || '_anon';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;
  END LOOP;
END $$;

-- mobile_logs_acesso: sem tenant_id — só corta UPDATE/DELETE abertos (append-only)
DO $$
BEGIN
  IF to_regclass('public.mobile_logs_acesso') IS NOT NULL THEN
    DROP POLICY IF EXISTS mobile_logs_acesso_update_anon ON public.mobile_logs_acesso;
    DROP POLICY IF EXISTS mobile_logs_acesso_delete_anon ON public.mobile_logs_acesso;
  END IF;
END $$;

-- ---------- 2) Revogar EXECUTE em funções ops/worker/trigger (service_role mantém) ----------
DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'claim_pdf_job',
    'complete_pdf_job',
    'fail_pdf_job',
    'iso_pro_prune_escala_outbox',
    'iso_pro_prune_atendimento_comandos',
    'iso_pro_prune_retencao_ops',
    'iso_pro_sync_auth_membership_from_usuario',
    'iso_pro_snapshot_escala_outbox_trg',
    'iso_pro_set_usuario_auth_link',
    'iso_pro_usuario_administra_utilizadores'
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

COMMIT;
