-- Export atendimento: filtro p_desde (periodo da UI) + RPC mais leve (sem COUNT, join simples).

BEGIN;

DROP FUNCTION IF EXISTS public.iso_pro_export_atendimentos_itens_page(uuid, int, int);
DROP FUNCTION IF EXISTS public.iso_pro_export_atendimentos_itens_page(uuid, int, int, timestamptz);

CREATE OR REPLACE FUNCTION public.iso_pro_export_atendimentos_itens_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000,
  p_desde timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_off int;
  v_lim int;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF to_regclass('public.iso_pro_atendimento_lote_itens') IS NULL THEN
    RETURN jsonb_build_object(
      'rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'none'
    );
  END IF;

  -- Sem COUNT(*) — o cliente para na pagina curta (total = -1).
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lote_numero', s.lote_numero,
        'lote_id', s.lote_id,
        'data_atendimento', s.data_atendimento,
        'status_lote', s.status_lote,
        'documento_numero', s.documento_numero,
        'documento_revisao', s.documento_revisao,
        'documento_descricao', s.documento_descricao,
        'documento_responsavel', s.documento_responsavel,
        'atendente', s.atendente,
        'recebedor_colaborador_id', s.recebedor_colaborador_id,
        'recebedor_tipo', s.recebedor_tipo,
        'recebedor', s.recebedor,
        'recebedor_empresa', s.recebedor_empresa,
        'recebedor_documento', s.recebedor_documento,
        'recebedor_telefone', s.recebedor_telefone,
        'autorizador_interno', s.autorizador_interno,
        'motivo_retirada', s.motivo_retirada,
        'origem_registro', s.origem_registro,
        'atendimento_item_id', s.atendimento_item_id,
        'documento_item_id', s.documento_item_id,
        'codigo_material', s.codigo_material,
        'descricao_material', s.descricao_material,
        'unidade', s.unidade,
        'quantidade_no_lote', s.quantidade_no_lote,
        'quantidade_retirada_original', s.quantidade_retirada_original
      )
      ORDER BY s.data_atendimento DESC NULLS LAST, s.lote_id, s.atendimento_item_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      coalesce(l.numero, '') AS lote_numero,
      l.id AS lote_id,
      CASE
        WHEN l.data_atendimento IS NULL THEN NULL
        ELSE to_char(l.data_atendimento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      END AS data_atendimento,
      coalesce(l.status, '') AS status_lote,
      coalesce(nullif(btrim(i.documento_numero), ''), nullif(btrim(l.documento_numero), ''), '') AS documento_numero,
      coalesce(d.revisao, '') AS documento_revisao,
      coalesce(d.descricao, '') AS documento_descricao,
      coalesce(d.responsavel, '') AS documento_responsavel,
      coalesce(l.atendente, '') AS atendente,
      coalesce(
        l.snapshot_atendimento->>'recebedorColaboradorId',
        l.snapshot_atendimento->>'recebedor_colaborador_id',
        ''
      ) AS recebedor_colaborador_id,
      coalesce(l.recebedor_tipo, '') AS recebedor_tipo,
      coalesce(l.recebedor, '') AS recebedor,
      coalesce(
        l.snapshot_atendimento->>'recebedorEmpresa',
        l.snapshot_atendimento->>'recebedor_empresa',
        ''
      ) AS recebedor_empresa,
      coalesce(
        l.snapshot_atendimento->>'recebedorDocumento',
        l.snapshot_atendimento->>'recebedor_documento',
        ''
      ) AS recebedor_documento,
      coalesce(
        l.snapshot_atendimento->>'recebedorTelefone',
        l.snapshot_atendimento->>'recebedor_telefone',
        ''
      ) AS recebedor_telefone,
      coalesce(
        l.snapshot_atendimento->>'autorizadorInterno',
        l.snapshot_atendimento->>'autorizador_interno',
        ''
      ) AS autorizador_interno,
      coalesce(
        l.snapshot_atendimento->>'motivoRetirada',
        l.snapshot_atendimento->>'motivo_retirada',
        ''
      ) AS motivo_retirada,
      coalesce(l.origem, '') AS origem_registro,
      i.id AS atendimento_item_id,
      coalesce(i.documento_item_id, '') AS documento_item_id,
      coalesce(i.codigo, '') AS codigo_material,
      coalesce(i.descricao, '') AS descricao_material,
      coalesce(nullif(btrim(i.unidade), ''), 'UN') AS unidade,
      coalesce(i.quantidade_atendida, 0) AS quantidade_no_lote,
      coalesce(nullif(i.quantidade_retirada_original, 0), i.quantidade_atendida, 0) AS quantidade_retirada_original
    FROM public.iso_pro_atendimento_lote_itens i
    INNER JOIN public.iso_pro_atendimento_lotes l
      ON l.id = i.lote_id AND l.tenant_id = i.tenant_id
    LEFT JOIN public.iso_pro_documentos_planejamento d
      ON d.tenant_id = i.tenant_id
     AND d.id::text = coalesce(nullif(btrim(i.documento_id), ''), nullif(btrim(l.documento_id), ''))
    WHERE i.tenant_id = p_tenant_id
      AND (
        p_desde IS NULL
        OR coalesce(l.data_atendimento, l.created_at) >= p_desde
      )
    ORDER BY l.data_atendimento DESC NULLS LAST, l.id, i.id
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', -1,
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int, timestamptz) IS
  'Export itens de atendimento (paginado). p_desde filtra pelo periodo da UI; sem COUNT.';

REVOKE ALL ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int, timestamptz) TO authenticated;

COMMIT;
