-- Reserva atomica de protocolo ATD (evita colisao mobile x PC).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_reservar_numero_atendimento(
  p_tenant_id uuid,
  p_baseline timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_updated timestamptz;
  v_new timestamptz;
  v_seq bigint;
  v_max bigint := 0;
  v_num text;
  v_hoje text;
  v_row jsonb;
  v_parsed bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_baseline IS NULL THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.payload, s.updated_at
  INTO v_payload, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id
    AND s.updated_at = p_baseline
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_hoje := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD');
  v_max := coalesce(nullif(trim(both from coalesce(v_payload #>> '{configuracoesSistema,sequenciaAtendimento}', '')), '')::bigint, 0);

  IF jsonb_typeof(v_payload -> 'atendimentoHistorico') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_payload -> 'atendimentoHistorico') LOOP
      v_num := upper(btrim(coalesce(v_row ->> 'loteNumero', '')));
      IF v_num ~ '^ATD-[0-9]{8}-[0-9]+$' AND substring(v_num from 5 for 8) = v_hoje THEN
        v_parsed := substring(v_num from 14)::bigint;
        IF v_parsed > v_max THEN v_max := v_parsed; END IF;
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(v_payload -> 'atendimentoLotes') = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(v_payload -> 'atendimentoLotes') LOOP
      v_num := upper(btrim(coalesce(v_row ->> 'numero', '')));
      IF v_num ~ '^ATD-[0-9]{8}-[0-9]+$' AND substring(v_num from 5 for 8) = v_hoje THEN
        v_parsed := substring(v_num from 14)::bigint;
        IF v_parsed > v_max THEN v_max := v_parsed; END IF;
      END IF;
    END LOOP;
  END IF;

  v_seq := v_max + 1;
  v_num := 'ATD-' || v_hoje || '-' || lpad(v_seq::text, 5, '0');

  WHILE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(v_payload -> 'atendimentoHistorico', '[]'::jsonb)) AS h(value)
    WHERE btrim(coalesce(h.value ->> 'loteNumero', '')) = v_num
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(v_payload -> 'atendimentoLotes', '[]'::jsonb)) AS l(value)
    WHERE btrim(coalesce(l.value ->> 'numero', '')) = v_num
  ) LOOP
    v_seq := v_seq + 1;
    v_num := 'ATD-' || v_hoje || '-' || lpad(v_seq::text, 5, '0');
  END LOOP;

  v_payload := jsonb_set(
    v_payload,
    '{configuracoesSistema}',
    coalesce(v_payload -> 'configuracoesSistema', '{}'::jsonb)
      || jsonb_build_object('sequenciaAtendimento', v_seq),
    true
  );

  v_new := now();
  UPDATE public.iso_pro_snapshot
  SET payload = v_payload, updated_at = v_new
  WHERE id = 'default'
    AND tenant_id = p_tenant_id
    AND updated_at = p_baseline;

  RETURN jsonb_build_object(
    'numero', v_num,
    'sequencia', v_seq,
    '_updatedAt', v_new
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_reservar_numero_atendimento(uuid, timestamptz) IS
  'Reserva protocolo ATD unico (sequencia atomica no snapshot).';

REVOKE ALL ON FUNCTION public.iso_pro_reservar_numero_atendimento(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_reservar_numero_atendimento(uuid, timestamptz) TO anon, authenticated;

COMMIT;
