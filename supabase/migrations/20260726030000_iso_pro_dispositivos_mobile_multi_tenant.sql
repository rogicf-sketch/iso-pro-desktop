-- Dispositivos mobile: mesmo aparelho em varias empresas.
--
-- Causa (26/07/2026): device_id era UNIQUE global. O telemovel ja estava
-- autorizado na Organizacao principal; ao entrar na Construcap o INSERT
-- falhava (unique) e o UPSERT tentava mudar tenant_id da linha antiga →
-- RLS «new row violates row-level security policy». O PC da Construcap
-- nao via o aparelho.
--
-- Correcao: UNIQUE (tenant_id, device_id) + RPC de registo por JWT.

BEGIN;

-- 1) Trocar unique global por unique por empresa
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'dispositivos_mobile'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%device_id%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%tenant_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.dispositivos_mobile DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Indices unique legados so em device_id
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'dispositivos_mobile'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%device_id%'
      AND indexdef NOT ILIKE '%tenant_id%'
  ) THEN
    FOR r IN
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'dispositivos_mobile'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%device_id%'
        AND indexdef NOT ILIKE '%tenant_id%'
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
    END LOOP;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_mobile_tenant_device_uidx
  ON public.dispositivos_mobile (tenant_id, device_id);

-- 2) RPC: registo seguro no tenant do JWT (ou anon com p_tenant_id validado por membership n/a — so JWT)
CREATE OR REPLACE FUNCTION public.iso_pro_upsert_dispositivo_mobile(
  p_tenant_id uuid,
  p_device jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt uuid;
  v_device_id text;
  v_row public.dispositivos_mobile%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_device IS NULL OR jsonb_typeof(p_device) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parametros invalidos.');
  END IF;

  IF auth.role() = 'authenticated' THEN
    v_jwt := public.iso_pro_jwt_tenant_id();
    IF v_jwt IS NULL OR v_jwt <> p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ISO_PRO_TENANT_FORBIDDEN');
    END IF;
  ELSIF auth.role() IS DISTINCT FROM 'service_role' THEN
    -- So JWT (authenticated) ou service_role; anon nao regista aparelhos.
    RETURN jsonb_build_object('ok', false, 'error', 'Sessao Auth necessaria para registar o aparelho.');
  END IF;
  v_device_id := NULLIF(btrim(coalesce(p_device->>'device_id', '')), '');
  IF v_device_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_id em falta.');
  END IF;

  INSERT INTO public.dispositivos_mobile (
    device_id, tenant_id, nome_aparelho, plataforma, modelo, versao_app,
    usuario_login, usuario_nome, autorizado, bloqueado, ultimo_acesso_em, updated_at
  ) VALUES (
    v_device_id,
    p_tenant_id,
    coalesce(NULLIF(btrim(p_device->>'nome_aparelho'), ''), 'Aparelho'),
    coalesce(NULLIF(btrim(p_device->>'plataforma'), ''), 'android'),
    coalesce(p_device->>'modelo', ''),
    coalesce(p_device->>'versao_app', ''),
    coalesce(p_device->>'usuario_login', ''),
    p_device->>'usuario_nome',
    coalesce((p_device->>'autorizado')::boolean, false),
    coalesce((p_device->>'bloqueado')::boolean, false),
    coalesce(NULLIF(btrim(p_device->>'ultimo_acesso_em'), '')::timestamptz, now()),
    now()
  )
  ON CONFLICT (tenant_id, device_id) DO UPDATE SET
    nome_aparelho = EXCLUDED.nome_aparelho,
    plataforma = EXCLUDED.plataforma,
    modelo = EXCLUDED.modelo,
    versao_app = EXCLUDED.versao_app,
    usuario_login = EXCLUDED.usuario_login,
    usuario_nome = EXCLUDED.usuario_nome,
    -- Nao reabrir autorizacao: so actualiza flags se a linha ja existia com esses valores no payload
    autorizado = CASE
      WHEN dispositivos_mobile.autorizado THEN true
      ELSE EXCLUDED.autorizado
    END,
    bloqueado = CASE
      WHEN dispositivos_mobile.bloqueado THEN true
      ELSE EXCLUDED.bloqueado
    END,
    ultimo_acesso_em = EXCLUDED.ultimo_acesso_em,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'dispositivo', jsonb_build_object(
      'id', v_row.id,
      'device_id', v_row.device_id,
      'nome_aparelho', v_row.nome_aparelho,
      'plataforma', v_row.plataforma,
      'modelo', v_row.modelo,
      'versao_app', v_row.versao_app,
      'autorizado', v_row.autorizado,
      'bloqueado', v_row.bloqueado,
      'usuario_login', v_row.usuario_login,
      'usuario_nome', v_row.usuario_nome,
      'ultimo_acesso_em', v_row.ultimo_acesso_em
    )
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_upsert_dispositivo_mobile(uuid, jsonb) IS
  'Regista/atualiza aparelho no tenant (unique por empresa). Preserva autorizado/bloqueado se ja true.';

REVOKE ALL ON FUNCTION public.iso_pro_upsert_dispositivo_mobile(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_upsert_dispositivo_mobile(uuid, jsonb) TO anon, authenticated, service_role;

COMMIT;
