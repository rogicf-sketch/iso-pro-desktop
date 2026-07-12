-- Leitura de desenhos no mobile: timeout maior + extração SQL com LIMIT 1 (para de varrer tudo no cliente).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_read_documento_planejamento(
  p_tenant_id uuid,
  p_documento_id text DEFAULT NULL,
  p_numero text DEFAULT NULL,
  p_revisao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '60s'
AS $$
  SELECT jsonb_build_object(
    '_updatedAt', s.updated_at,
    'documento', picked.doc
  )
  FROM public.iso_pro_snapshot AS s
  LEFT JOIN LATERAL (
    SELECT elem.value AS doc
    FROM jsonb_array_elements(s.payload -> 'documentos') AS elem(value)
    WHERE jsonb_typeof(s.payload -> 'documentos') = 'array'
      AND (
        (
          NULLIF(btrim(COALESCE(p_documento_id, '')), '') IS NOT NULL
          AND btrim(COALESCE(elem.value ->> 'id', '')) = btrim(p_documento_id)
        )
        OR (
          NULLIF(btrim(COALESCE(p_documento_id, '')), '') IS NULL
          AND NULLIF(btrim(COALESCE(p_numero, '')), '') IS NOT NULL
          AND lower(btrim(COALESCE(elem.value ->> 'numero', ''))) = lower(btrim(p_numero))
          AND (
            NULLIF(btrim(COALESCE(p_revisao, '')), '') IS NULL
            OR lower(btrim(COALESCE(elem.value ->> 'revisao', ''))) = lower(btrim(p_revisao))
          )
        )
      )
    LIMIT 1
  ) AS picked ON true
  WHERE s.id = 'default'
    AND s.tenant_id = p_tenant_id;
$$;

ALTER FUNCTION public.iso_pro_search_documentos_planejamento(uuid, text, int)
  SET statement_timeout = '60s';

ALTER FUNCTION public.iso_pro_list_documentos_planejamento_resumo(uuid)
  SET statement_timeout = '60s';

ALTER FUNCTION public.iso_pro_list_documentos_pendencia_material(uuid, text)
  SET statement_timeout = '60s';

COMMENT ON FUNCTION public.iso_pro_read_documento_planejamento(uuid, text, text, text) IS
  'Leitura de um desenho (com itens) por id ou numero/revisao — optimizado LIMIT 1.';

COMMIT;
