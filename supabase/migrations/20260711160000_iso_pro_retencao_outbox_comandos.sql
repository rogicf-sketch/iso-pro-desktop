-- Retenção: limpar outbox de escala e comandos de atendimento antigos (SRE / nível mundial).
-- Funções chamáveis manualmente ou via pg_cron (se a extensão estiver disponível).
-- Default: done/failed com completed_at > 30 dias; comandos applied/failed > 30 dias.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_prune_escala_outbox(
  p_retain_days integer DEFAULT 30,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
  v_cut timestamptz;
  v_deleted integer := 0;
BEGIN
  v_days := GREATEST(COALESCE(p_retain_days, 30), 7);
  v_cut := now() - make_interval(days => v_days);

  DELETE FROM public.iso_pro_escala_outbox o
  WHERE o.status IN ('done', 'failed')
    AND COALESCE(o.completed_at, o.created_at) < v_cut
    AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'table', 'iso_pro_escala_outbox',
    'deleted', v_deleted,
    'retain_days', v_days,
    'cutoff', v_cut,
    'tenant_id', p_tenant_id
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_prune_escala_outbox(integer, uuid) IS
  'Expurga jobs done/failed da outbox de escala mais antigos que p_retain_days (minimo 7).';

REVOKE ALL ON FUNCTION public.iso_pro_prune_escala_outbox(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_prune_escala_outbox(integer, uuid) TO service_role;

-- Comandos de atendimento (fila mobile/PC) — só se a tabela existir
DO $$
BEGIN
  IF to_regclass('public.iso_pro_atendimento_comandos') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.iso_pro_prune_atendimento_comandos(
      p_retain_days integer DEFAULT 30,
      p_tenant_id uuid DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      v_days integer;
      v_cut timestamptz;
      v_deleted integer := 0;
    BEGIN
      v_days := GREATEST(COALESCE(p_retain_days, 30), 7);
      v_cut := now() - make_interval(days => v_days);

      -- Auditoria idempotente: manter janela recente; expurgar o resto.
      DELETE FROM public.iso_pro_atendimento_comandos c
      WHERE c.created_at < v_cut
        AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      RETURN jsonb_build_object(
        'ok', true,
        'table', 'iso_pro_atendimento_comandos',
        'deleted', v_deleted,
        'retain_days', v_days,
        'cutoff', v_cut,
        'tenant_id', p_tenant_id
      );
    END;
    $body$;
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.iso_pro_prune_atendimento_comandos(integer, uuid) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.iso_pro_prune_atendimento_comandos(integer, uuid) TO service_role';
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_prune_retencao_ops(
  p_retain_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox jsonb;
  v_cmds jsonb := jsonb_build_object('ok', true, 'skipped', true, 'reason', 'tabela ausente');
BEGIN
  v_outbox := public.iso_pro_prune_escala_outbox(p_retain_days, NULL);

  IF to_regclass('public.iso_pro_atendimento_comandos') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'iso_pro_prune_atendimento_comandos'
     )
  THEN
    v_cmds := public.iso_pro_prune_atendimento_comandos(p_retain_days, NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'at', now(),
    'retain_days', GREATEST(COALESCE(p_retain_days, 30), 7),
    'outbox', v_outbox,
    'atendimento_comandos', v_cmds
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_prune_retencao_ops(integer) IS
  'Job unico de retencao: outbox escala + comandos atendimento (se existirem).';

REVOKE ALL ON FUNCTION public.iso_pro_prune_retencao_ops(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_prune_retencao_ops(integer) TO service_role;

-- Agendar diário às 04:15 UTC se pg_cron estiver disponível (Supabase Pro+).
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ausente — agende manualmente: SELECT iso_pro_prune_retencao_ops(30);';
    RETURN;
  END IF;

  -- Remove job anterior com o mesmo nome (idempotente)
  PERFORM cron.unschedule(j.jobid)
  FROM cron.job j
  WHERE j.jobname = 'iso_pro_prune_retencao_ops_daily';

  SELECT cron.schedule(
    'iso_pro_prune_retencao_ops_daily',
    '15 4 * * *',
    $cron$SELECT public.iso_pro_prune_retencao_ops(30);$cron$
  ) INTO v_job_id;

  RAISE NOTICE 'pg_cron job iso_pro_prune_retencao_ops_daily id=%', v_job_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Nao foi possivel agendar pg_cron (%). Chame iso_pro_prune_retencao_ops(30) manualmente ou via CI.', SQLERRM;
END;
$$;

COMMIT;
