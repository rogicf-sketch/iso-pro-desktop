-- RPC upsert: alinhar ON CONFLICT com unique global device_id (APK compat).

BEGIN;

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
  ON CONFLICT (device_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    nome_aparelho = EXCLUDED.nome_aparelho,
    plataforma = EXCLUDED.plataforma,
    modelo = EXCLUDED.modelo,
    versao_app = EXCLUDED.versao_app,
    usuario_login = EXCLUDED.usuario_login,
    usuario_nome = EXCLUDED.usuario_nome,
    autorizado = CASE
      WHEN dispositivos_mobile.autorizado AND dispositivos_mobile.tenant_id = EXCLUDED.tenant_id THEN true
      WHEN EXCLUDED.autorizado THEN true
      ELSE false
    END,
    bloqueado = CASE
      WHEN dispositivos_mobile.bloqueado AND dispositivos_mobile.tenant_id = EXCLUDED.tenant_id THEN true
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
  'Regista/atualiza aparelho (unique device_id). Move tenant se necessario; preserva autorizado no mesmo tenant.';

COMMIT;
