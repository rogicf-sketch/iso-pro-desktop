-- Lista leve de desenhos (sem itens[]) para o mobile atendimento — carrega ~1200 docs rapido.
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_planejamento_resumo(
  p_tenant_id uuid
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
  v_docs jsonb;
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
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb);
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.value -> 'id',
        'numero', d.value -> 'numero',
        'revisao', d.value -> 'revisao',
        'descricao', d.value -> 'descricao',
        'responsavel', d.value -> 'responsavel',
        'status', d.value -> 'status',
        'itens', '[]'::jsonb
      )
      ORDER BY btrim(coalesce(d.value ->> 'numero', ''))
    ),
    '[]'::jsonb
  )
  INTO v_docs
  FROM jsonb_array_elements(v_payload -> 'documentos') AS d(value);

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_docs);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_documentos_planejamento_resumo(uuid) IS
  'Cabecalhos dos desenhos do planejamento (sem linhas) — lista rapida no mobile.';

REVOKE ALL ON FUNCTION public.iso_pro_list_documentos_planejamento_resumo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_list_documentos_planejamento_resumo(uuid) TO anon, authenticated;

COMMIT;
