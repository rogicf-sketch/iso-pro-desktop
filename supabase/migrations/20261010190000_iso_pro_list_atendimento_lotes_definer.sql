-- O Historico do site chama esta funcao com a chave anon.
-- A tabela esta fechada para anon (RLS so authenticated), entao a lista vinha vazia.
-- DEFINER le as linhas depois de iso_pro_assert_tenant_caller. A tabela continua sem GRANT para anon.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_list_atendimento_lotes(
  p_tenant_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_q text DEFAULT NULL,
  p_desde timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_q text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_total bigint := 0;
  v_items jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      '_error', 'tenant_id em falta.',
      'atendimentos', '[]'::jsonb,
      'totalCount', 0
    );
  END IF;

  SELECT count(*)::bigint
  INTO v_total
  FROM public.iso_pro_atendimento_lotes l
  WHERE l.tenant_id = p_tenant_id
    AND (p_desde IS NULL OR coalesce(l.data_atendimento, l.created_at) >= p_desde)
    AND (
      v_q IS NULL
      OR l.numero ILIKE '%' || v_q || '%'
      OR coalesce(l.documento_numero, '') ILIKE '%' || v_q || '%'
      OR coalesce(l.atendente, '') ILIKE '%' || v_q || '%'
      OR coalesce(l.recebedor, '') ILIKE '%' || v_q || '%'
      OR EXISTS (
        SELECT 1
        FROM public.iso_pro_atendimento_lote_itens i
        WHERE i.tenant_id = l.tenant_id
          AND i.lote_id = l.id
          AND (
            coalesce(i.codigo, '') ILIKE '%' || v_q || '%'
            OR coalesce(i.descricao, '') ILIKE '%' || v_q || '%'
          )
      )
    );

  SELECT coalesce(jsonb_agg(row_at ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      coalesce(l.snapshot_atendimento, '{}'::jsonb) || jsonb_build_object(
        'id', l.id,
        'numero', l.numero,
        'status', l.status,
        'documentoId', l.documento_id,
        'documentoNumero', l.documento_numero,
        'atendente', l.atendente,
        'recebedor', l.recebedor,
        'recebedorTipo', l.recebedor_tipo,
        'dataAtendimento', to_char(l.data_atendimento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'origem', l.origem,
        'itens', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id,
            'documentoItemId', i.documento_item_id,
            'documentoNumero', i.documento_numero,
            'codigoMaterial', i.codigo,
            'descricaoMaterial', i.descricao,
            'unidade', i.unidade,
            'quantidadeAtendida', i.quantidade_atendida,
            'quantidadeRetiradaOriginal', i.quantidade_retirada_original
          ) ORDER BY i.codigo)
          FROM public.iso_pro_atendimento_lote_itens i
          WHERE i.tenant_id = l.tenant_id AND i.lote_id = l.id
        ), '[]'::jsonb)
      ) AS row_at,
      row_number() OVER (
        ORDER BY coalesce(l.data_atendimento, l.created_at) DESC, l.created_at DESC
      ) AS ord
    FROM public.iso_pro_atendimento_lotes l
    WHERE l.tenant_id = p_tenant_id
      AND (p_desde IS NULL OR coalesce(l.data_atendimento, l.created_at) >= p_desde)
      AND (
        v_q IS NULL
        OR l.numero ILIKE '%' || v_q || '%'
        OR coalesce(l.documento_numero, '') ILIKE '%' || v_q || '%'
        OR coalesce(l.atendente, '') ILIKE '%' || v_q || '%'
        OR coalesce(l.recebedor, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1
          FROM public.iso_pro_atendimento_lote_itens i
          WHERE i.tenant_id = l.tenant_id
            AND i.lote_id = l.id
            AND (
              coalesce(i.codigo, '') ILIKE '%' || v_q || '%'
              OR coalesce(i.descricao, '') ILIKE '%' || v_q || '%'
            )
        )
      )
    ORDER BY coalesce(l.data_atendimento, l.created_at) DESC, l.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object(
    'atendimentos', coalesce(v_items, '[]'::jsonb),
    'totalCount', v_total,
    'limit', v_limit,
    'offset', v_offset,
    '_updatedAt', public.iso_pro_read_snapshot_cursor(p_tenant_id)
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_list_atendimento_lotes(uuid, integer, integer, text, timestamptz) IS
  'Historico de atendimentos paginado. SECURITY DEFINER: a lista do site usa a chave anon e a tabela nao tem GRANT para anon.';

NOTIFY pgrst, 'reload schema';

COMMIT;
