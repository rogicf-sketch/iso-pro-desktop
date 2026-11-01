-- Leituras table-first para Atendimento mobile + submit escala (recebimentos/inventarios)
-- sem o cliente chamar iso_pro_patch_snapshot pelo nome.

BEGIN;

-- Cursor OCC (1 coluna) — evita baixar payload JSON.
CREATE OR REPLACE FUNCTION public.iso_pro_read_snapshot_cursor(p_tenant_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  SELECT s.updated_at INTO v_at
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.iso_pro_read_snapshot_cursor(uuid) IS
  'Só updated_at do snapshot default — baseline OCC sem payload.';

REVOKE ALL ON FUNCTION public.iso_pro_read_snapshot_cursor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_snapshot_cursor(uuid) TO anon, authenticated, service_role;

-- Confirmação de baixa: agrega histórico/lotes a partir de iso_pro_atendimento_comandos.
CREATE OR REPLACE FUNCTION public.iso_pro_read_atendimento_confirmacao(
  p_tenant_id uuid,
  p_lote_numero text,
  p_lote_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_num text;
  v_hist jsonb := '[]'::jsonb;
  v_lotes jsonb := '[]'::jsonb;
  v_cursor timestamptz;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  v_num := NULLIF(btrim(coalesce(p_lote_numero, '')), '');
  IF v_num IS NULL THEN
    RETURN jsonb_build_object(
      'atendimentoHistorico', '[]'::jsonb,
      'atendimentoLotes', '[]'::jsonb,
      'itensCount', 0,
      '_updatedAt', public.iso_pro_read_snapshot_cursor(p_tenant_id)
    );
  END IF;

  SELECT coalesce(
    (
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM (
        SELECT
          elem,
          ord,
          row_number() OVER (
            PARTITION BY coalesce(elem->>'id', elem->>'codigo', elem::text)
            ORDER BY c.created_at DESC
          ) AS rn
        FROM public.iso_pro_atendimento_comandos c
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(c.payload->'atendimentoHistorico') = 'array'
              THEN c.payload->'atendimentoHistorico'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS t(elem, ord)
        WHERE c.tenant_id = p_tenant_id
          AND c.snapshot_updated_at IS NOT NULL
          AND btrim(coalesce(elem->>'loteNumero', '')) = v_num
          AND (
            p_lote_id IS NULL
            OR (elem->>'loteId')::bigint = p_lote_id
            OR elem->>'loteId' = p_lote_id::text
          )
      ) x
      WHERE rn = 1
    ),
    '[]'::jsonb
  )
  INTO v_hist;

  SELECT coalesce(
    (
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM (
        SELECT
          elem,
          ord,
          row_number() OVER (
            PARTITION BY coalesce(elem->>'id', elem->>'numero', elem::text)
            ORDER BY c.created_at DESC
          ) AS rn
        FROM public.iso_pro_atendimento_comandos c
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(c.payload->'atendimentoLotes') = 'array'
              THEN c.payload->'atendimentoLotes'
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS t(elem, ord)
        WHERE c.tenant_id = p_tenant_id
          AND c.snapshot_updated_at IS NOT NULL
          AND (
            btrim(coalesce(elem->>'numero', '')) = v_num
            OR btrim(coalesce(elem->>'loteNumero', '')) = v_num
          )
      ) x
      WHERE rn = 1
    ),
    '[]'::jsonb
  )
  INTO v_lotes;

  v_cursor := public.iso_pro_read_snapshot_cursor(p_tenant_id);

  RETURN jsonb_build_object(
    'atendimentoHistorico', v_hist,
    'atendimentoLotes', v_lotes,
    'itensCount', coalesce(jsonb_array_length(v_hist), 0),
    '_updatedAt', v_cursor
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_read_atendimento_confirmacao(uuid, text, bigint) IS
  'Histórico/lotes de um protocolo a partir da tabela de comandos (não baixa o blob).';

REVOKE ALL ON FUNCTION public.iso_pro_read_atendimento_confirmacao(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_atendimento_confirmacao(uuid, text, bigint)
  TO anon, authenticated, service_role;

-- Fatias mínimas ainda no snapshot (colaboradores / config — sem tabela própria).
CREATE OR REPLACE FUNCTION public.iso_pro_read_snapshot_meta_slices(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_at timestamptz;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  SELECT s.payload, s.updated_at INTO v_payload, v_at
  FROM public.iso_pro_snapshot s
  WHERE s.id = 'default' AND s.tenant_id = p_tenant_id;
  RETURN jsonb_build_object(
    'colaboradores', coalesce(v_payload->'colaboradores', '[]'::jsonb),
    'configuracoesSistema', coalesce(v_payload->'configuracoesSistema', '{}'::jsonb),
    'estoqueAjustes', coalesce(v_payload->'estoqueAjustes', '[]'::jsonb),
    '_updatedAt', v_at
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_read_snapshot_meta_slices(uuid) IS
  'Só colaboradores/config/ajustes do payload — boot mobile sem documentos/hist.';

REVOKE ALL ON FUNCTION public.iso_pro_read_snapshot_meta_slices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_read_snapshot_meta_slices(uuid)
  TO anon, authenticated, service_role;

-- Submit domínio escala: valida chaves e delega ao patch_snapshot (cliente não chama patch pelo nome).
CREATE OR REPLACE FUNCTION public.iso_pro_submit_escala_domain_patch(
  p_tenant_id uuid,
  p_baseline timestamptz,
  p_patch jsonb,
  p_merge_keys text[] DEFAULT NULL,
  p_domain text DEFAULT 'recebimentos'
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_key text;
  v_allowed text[];
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  v_domain := lower(btrim(coalesce(p_domain, 'recebimentos')));

  IF v_domain = 'recebimentos' THEN
    v_allowed := ARRAY['recebimentos', 'materiais', 'dataAtualizacao'];
  ELSIF v_domain IN ('inventarios', 'inventario') THEN
    v_allowed := ARRAY['inventarios', 'materiais', 'estoqueAjustes', 'dataAtualizacao'];
  ELSE
    RAISE EXCEPTION 'ISO_PRO_ESCALA_DOMAIN_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'ISO_PRO_SNAPSHOT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ISO_PRO_ESCALA_DOMAIN_KEY_FORBIDDEN:%', v_key USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN public.iso_pro_patch_snapshot(p_tenant_id, p_baseline, p_patch, p_merge_keys);
END;
$$;

COMMENT ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text) IS
  'Escrita conferência/inventário mobile: chaves limitadas; server chama patch_snapshot.';

REVOKE ALL ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iso_pro_submit_escala_domain_patch(uuid, timestamptz, jsonb, text[], text)
  TO anon, authenticated, service_role;

COMMIT;
