-- Busca parcial de desenhos (mobile atendimento boot leve — nao envia documentos[] inteiros).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_search_documentos_planejamento(
  p_tenant_id uuid,
  p_texto text,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_updated timestamptz;
  v_row jsonb;
  v_q text;
  v_num text;
  v_rev text;
  v_desc text;
  v_out jsonb := '[]'::jsonb;
  v_n int := 0;
  v_lim int;
  v_seg text;
BEGIN
  IF p_tenant_id IS NULL OR p_texto IS NULL OR btrim(p_texto) = '' THEN
    RETURN jsonb_build_object('_error', 'Parametros invalidos.');
  END IF;

  v_lim := greatest(1, least(coalesce(p_limit, 50), 100));
  v_q := lower(btrim(p_texto));

  SELECT s.payload, s.updated_at
  INTO v_payload, v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;

  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb);
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_payload -> 'documentos') LOOP
    EXIT WHEN v_n >= v_lim;

    v_num := lower(btrim(coalesce(v_row ->> 'numero', '')));
    v_rev := lower(btrim(coalesce(v_row ->> 'revisao', '')));
    v_desc := lower(btrim(coalesce(v_row ->> 'descricao', '')));

    IF v_num = v_q THEN
      v_out := v_out || jsonb_build_array(v_row);
      v_n := v_n + 1;
      CONTINUE;
    END IF;

    IF v_num LIKE '%' || v_q || '%'
      OR v_rev LIKE '%' || v_q || '%'
      OR v_desc LIKE '%' || v_q || '%' THEN
      v_out := v_out || jsonb_build_array(v_row);
      v_n := v_n + 1;
      CONTINUE;
    END IF;

    IF length(v_q) >= 2 THEN
      FOR v_seg IN
        SELECT unnest(regexp_split_to_array(v_num, '[-_/]+'))
      LOOP
        IF v_seg = '' THEN CONTINUE; END IF;
        IF v_seg LIKE v_q || '%' OR v_seg LIKE '%' || v_q || '%' OR v_q LIKE v_seg || '%' THEN
          v_out := v_out || jsonb_build_array(v_row);
          v_n := v_n + 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_out);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_search_documentos_planejamento(uuid, text, int) IS
  'Busca parcial de desenhos do planejamento (numero, revisao, segmentos) — mobile atendimento.';

REVOKE ALL ON FUNCTION public.iso_pro_search_documentos_planejamento(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_search_documentos_planejamento(uuid, text, int) TO anon, authenticated;

COMMIT;
