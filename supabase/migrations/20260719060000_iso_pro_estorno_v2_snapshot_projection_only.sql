-- Estorno V2 — snapshot como projecao + leituras pos-split da coluna documentos.
--
-- Contrato operacional:
-- 1) Clientes com VITE_ISO_PRO_ESTORNO_V2 activo usam a RPC V2.
-- 2) Fallback legado (merge completo de documentos[]) so corre se a RPC faltar.
-- 3) Sync snapshot→tabelas preserva quantidade_atendida (guardrail 19040000).
-- 4) Rebuild da coluna documentos fica fora do caminho critico do estorno.
-- 5) Fallbacks de leitura NAO usam payload->'documentos' (vazio apos o split).

COMMENT ON FUNCTION public.iso_pro_estornar_atendimento_v2(
  uuid, text, text, text, jsonb, text, text, text, bigint
) IS
  'Estorno V2 atomico: tabelas SoT + eventos + projecao leve (atendimentos/log). '
  'Coluna documentos e cache regeneravel — nao e reescrita no caminho critico.';

-- ---------- Leitura: preferir tabelas; fallback via coluna documentos ----------
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
AS $$
DECLARE
  v_updated timestamptz;
  v_id text;
  v_num text;
  v_rev text;
  v_doc_id text;
  v_doc jsonb;
  v_docs jsonb;
  v_row jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  v_id := NULLIF(btrim(COALESCE(p_documento_id, '')), '');
  v_num := NULLIF(btrim(COALESCE(p_numero, '')), '');
  v_rev := NULLIF(btrim(COALESCE(p_revisao, '')), '');

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    IF v_id IS NOT NULL THEN
      v_doc := public.iso_pro_documento_row_to_jsonb(p_tenant_id, v_id, true);
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_doc, '_source', 'tables');
    END IF;
    IF v_num IS NOT NULL THEN
      SELECT d.id INTO v_doc_id
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = p_tenant_id
        AND lower(btrim(d.numero)) = lower(v_num)
        AND (
          v_rev IS NULL
          OR lower(btrim(d.revisao)) = lower(v_rev)
        )
      ORDER BY CASE WHEN jsonb_array_length(
        coalesce((public.iso_pro_documento_row_to_jsonb(p_tenant_id, d.id, true) -> 'itens'), '[]'::jsonb)
      ) > 0 THEN 0 ELSE 1 END
      LIMIT 1;
      v_doc := public.iso_pro_documento_row_to_jsonb(p_tenant_id, v_doc_id, true);
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_doc, '_source', 'tables');
    END IF;
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null, '_source', 'tables');
  END IF;

  -- Fallback pos-split: coluna documentos (nao payload->documentos).
  v_docs := public.iso_pro_snapshot_documentos_arr(p_tenant_id);
  IF v_docs IS NULL OR jsonb_typeof(v_docs) <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null, '_source', 'snapshot');
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_docs) LOOP
    IF v_id IS NOT NULL AND btrim(COALESCE(v_row ->> 'id', '')) = v_id THEN
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_row, '_source', 'snapshot');
    END IF;
    IF v_id IS NULL AND v_num IS NOT NULL
      AND lower(btrim(COALESCE(v_row ->> 'numero', ''))) = lower(v_num)
      AND (
        v_rev IS NULL
        OR lower(btrim(COALESCE(v_row ->> 'revisao', ''))) = lower(v_rev)
      ) THEN
      RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', v_row, '_source', 'snapshot');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documento', null, '_source', 'snapshot');
END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_list_documentos_pendencia_material(
  p_tenant_id uuid,
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated timestamptz;
  v_cod text;
  v_docs jsonb;
  v_doc jsonb;
  v_item jsonb;
  v_q_proj numeric;
  v_q_at numeric;
  v_cod_linha text;
  v_out jsonb := '[]'::jsonb;
  v_tem boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_codigo IS NULL OR btrim(p_codigo) = '' THEN
    RETURN jsonb_build_object('_error', 'Parametros invalidos.');
  END IF;

  v_cod := lower(btrim(p_codigo));

  SELECT s.updated_at INTO v_updated
  FROM public.iso_pro_snapshot AS s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;

  IF public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    SELECT coalesce(
      jsonb_agg(public.iso_pro_documento_row_to_jsonb(p_tenant_id, x.documento_id, true) ORDER BY x.numero),
      '[]'::jsonb
    )
    INTO v_docs
    FROM (
      SELECT DISTINCT i.documento_id, d.numero
      FROM public.iso_pro_documento_itens_planejamento i
      JOIN public.iso_pro_documentos_planejamento d
        ON d.tenant_id = i.tenant_id AND d.id = i.documento_id
      WHERE i.tenant_id = p_tenant_id
        AND lower(btrim(coalesce(i.codigo, ''))) = v_cod
        AND (i.quantidade - i.quantidade_atendida) > 1e-9
    ) x;

    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_docs, '_source', 'tables');
  END IF;

  v_docs := public.iso_pro_snapshot_documentos_arr(p_tenant_id);
  IF v_docs IS NULL OR jsonb_typeof(v_docs) <> 'array' THEN
    RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', '[]'::jsonb, '_source', 'snapshot');
  END IF;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(v_docs) LOOP
    v_tem := false;
    IF jsonb_typeof(v_doc -> 'itens') = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_doc -> 'itens') LOOP
        v_cod_linha := lower(btrim(COALESCE(v_item ->> 'codigo', '')));
        IF v_cod_linha = '' OR v_cod_linha <> v_cod THEN
          CONTINUE;
        END IF;
        v_q_proj := COALESCE(NULLIF(v_item ->> 'quantidade', '')::numeric, 0);
        v_q_at := COALESCE(NULLIF(v_item ->> 'quantidadeAtendida', '')::numeric, 0);
        IF v_q_proj - v_q_at > 1e-9 THEN
          v_tem := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_tem THEN
      v_out := v_out || jsonb_build_array(v_doc);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('_updatedAt', v_updated, 'documentos', v_out, '_source', 'snapshot');
END;
$$;
