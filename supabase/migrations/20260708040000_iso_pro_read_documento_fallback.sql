-- Leitura de desenho no mobile: fallback numero/revisao quando id nao encontra ou vem sem itens.

BEGIN;



CREATE OR REPLACE FUNCTION public.iso_pro_read_documento_planejamento(

  p_tenant_id uuid,

  p_documento_id text DEFAULT NULL,

  p_numero text DEFAULT NULL,

  p_revisao text DEFAULT NULL

)

RETURNS jsonb

LANGUAGE plpgsql

STABLE

SECURITY INVOKER

SET search_path = public

SET statement_timeout = '60s'

AS $$

DECLARE

  v_payload jsonb;

  v_updated timestamptz;

  v_doc jsonb;

  v_id text;

  v_num text;

  v_rev text;

BEGIN

  IF p_tenant_id IS NULL THEN

    RETURN jsonb_build_object('_error', 'tenant_id em falta.');

  END IF;



  SELECT s.payload, s.updated_at

  INTO v_payload, v_updated

  FROM public.iso_pro_snapshot AS s

  WHERE s.id = 'default'

    AND s.tenant_id = p_tenant_id;



  IF v_payload IS NULL OR jsonb_typeof(v_payload -> 'documentos') <> 'array' THEN

    RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null);

  END IF;



  v_id := NULLIF(btrim(COALESCE(p_documento_id, '')), '');

  v_num := NULLIF(btrim(COALESCE(p_numero, '')), '');

  v_rev := NULLIF(btrim(COALESCE(p_revisao, '')), '');



  IF v_id IS NOT NULL THEN

    SELECT elem.value

    INTO v_doc

    FROM jsonb_array_elements(v_payload -> 'documentos') AS elem(value)

    WHERE btrim(COALESCE(elem.value ->> 'id', '')) = v_id

    LIMIT 1;



    IF v_doc IS NOT NULL

      AND jsonb_typeof(v_doc -> 'itens') = 'array'

      AND jsonb_array_length(v_doc -> 'itens') > 0 THEN

      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_doc);

    END IF;

  END IF;



  IF v_num IS NOT NULL THEN

    SELECT elem.value

    INTO v_doc

    FROM jsonb_array_elements(v_payload -> 'documentos') AS elem(value)

    WHERE lower(btrim(COALESCE(elem.value ->> 'numero', ''))) = lower(v_num)

      AND (

        v_rev IS NULL

        OR lower(btrim(COALESCE(elem.value ->> 'revisao', ''))) = lower(v_rev)

      )

    ORDER BY

      CASE

        WHEN jsonb_typeof(elem.value -> 'itens') = 'array' THEN jsonb_array_length(elem.value -> 'itens')

        ELSE 0

      END DESC

    LIMIT 1;

  END IF;



  RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_doc);

END;

$$;



COMMENT ON FUNCTION public.iso_pro_read_documento_planejamento(uuid, text, text, text) IS

  'Leitura de um desenho (com itens) por id ou numero/revisao — fallback quando id nao traz linhas.';



COMMIT;


