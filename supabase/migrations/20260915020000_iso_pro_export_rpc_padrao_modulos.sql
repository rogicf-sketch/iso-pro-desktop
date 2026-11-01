-- Exportações rápidas: Documentos (page 5000) + Recebimentos + Atendimento + RIR + Materiais.
-- Envelope comum: { rows, total, offset, limit, _source }

BEGIN;

-- ---------------------------------------------------------------------------
-- Documentos: default 5000
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iso_pro_export_documentos_itens_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
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
  v_total int := -1;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF NOT public.iso_pro_documentos_tabelas_ativas(p_tenant_id) THEN
    RETURN jsonb_build_object(
      'rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'snapshot'
    );
  END IF;

  IF v_off = 0 THEN
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_documento_itens_planejamento i
    WHERE i.tenant_id = p_tenant_id;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'documento_id', s.documento_id,
        'numero', s.numero,
        'revisao', s.revisao,
        'descricao_documento', s.descricao_documento,
        'responsavel', s.responsavel,
        'data_documento', s.data_documento,
        'status_documento', s.status_documento,
        'item_id', s.item_id,
        'codigo_material', s.codigo_material,
        'descricao_material', s.descricao_material,
        'unidade', s.unidade,
        'quantidade_documento', s.quantidade_documento,
        'quantidade_atendida', s.quantidade_atendida,
        'localizacao_planejamento', s.localizacao_planejamento
      )
      ORDER BY s.numero, s.documento_id, s.item_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      d.id::text AS documento_id,
      d.numero,
      coalesce(nullif(btrim(d.revisao), ''), 'A') AS revisao,
      coalesce(d.descricao, '') AS descricao_documento,
      coalesce(d.responsavel, '') AS responsavel,
      CASE WHEN d.data_documento IS NULL THEN NULL ELSE to_char(d.data_documento::date, 'YYYY-MM-DD') END AS data_documento,
      coalesce(nullif(btrim(d.status), ''), 'pendente') AS status_documento,
      i.id::text AS item_id,
      coalesce(i.codigo, '') AS codigo_material,
      coalesce(i.descricao, '') AS descricao_material,
      coalesce(nullif(btrim(i.unidade), ''), 'UN') AS unidade,
      coalesce(i.quantidade, 0) AS quantidade_documento,
      coalesce(i.quantidade_atendida, 0) AS quantidade_atendida,
      coalesce(i.localizacao, '') AS localizacao_planejamento
    FROM public.iso_pro_documento_itens_planejamento i
    INNER JOIN public.iso_pro_documentos_planejamento d
      ON d.id = i.documento_id AND d.tenant_id = i.tenant_id
    WHERE i.tenant_id = p_tenant_id
    ORDER BY d.numero, d.id, i.id
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, -1),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Recebimentos itens
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iso_pro_export_recebimentos_itens_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
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
  v_total int := -1;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF to_regclass('public.iso_pro_recebimento_itens') IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'none');
  END IF;

  IF v_off = 0 THEN
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_recebimento_itens i
    WHERE i.tenant_id = p_tenant_id;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recebimento_id', s.recebimento_id,
        'fornecedor', s.fornecedor,
        'data_recebimento', s.data_recebimento,
        'nota_fiscal', s.nota_fiscal,
        'romaneio', s.romaneio,
        'conferente', s.conferente,
        'modo_recebimento', s.modo_recebimento,
        'status', s.status,
        'data_conferencia', s.data_conferencia,
        'observacoes', s.observacoes,
        'codigo_material', s.codigo_material,
        'descricao_material', s.descricao_material,
        'unidade', s.unidade,
        'disciplina', s.disciplina,
        'localizacao', s.localizacao,
        'quantidade_recebida', s.quantidade_recebida,
        'quantidade_conferida', s.quantidade_conferida,
        'peso_unitario', s.peso_unitario,
        'peso_total', s.peso_total,
        'certificado', s.certificado
      )
      ORDER BY s.data_recebimento DESC NULLS LAST, s.recebimento_id, s.item_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      r.id AS recebimento_id,
      coalesce(r.fornecedor, '') AS fornecedor,
      CASE WHEN r.data_recebimento IS NULL THEN NULL ELSE to_char(r.data_recebimento::date, 'YYYY-MM-DD') END AS data_recebimento,
      coalesce(r.nota_fiscal, '') AS nota_fiscal,
      coalesce(r.romaneio, '') AS romaneio,
      coalesce(r.conferente, '') AS conferente,
      coalesce(r.modo_recebimento, '') AS modo_recebimento,
      coalesce(r.status, '') AS status,
      CASE WHEN r.data_conferencia IS NULL THEN NULL ELSE to_char(r.data_conferencia AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END AS data_conferencia,
      coalesce(r.observacoes, '') AS observacoes,
      i.id AS item_id,
      coalesce(i.codigo, '') AS codigo_material,
      coalesce(i.descricao, '') AS descricao_material,
      coalesce(nullif(btrim(i.unidade), ''), 'UN') AS unidade,
      coalesce(i.disciplina, '') AS disciplina,
      coalesce(i.localizacao, '') AS localizacao,
      coalesce(i.quantidade, 0) AS quantidade_recebida,
      coalesce(i.quantidade_conferida, 0) AS quantidade_conferida,
      coalesce(i.peso_unitario, 0) AS peso_unitario,
      coalesce(i.peso_total, 0) AS peso_total,
      coalesce(i.certificado, '') AS certificado
    FROM public.iso_pro_recebimento_itens i
    INNER JOIN public.iso_pro_recebimentos r
      ON r.id = i.recebimento_id AND r.tenant_id = i.tenant_id
    WHERE i.tenant_id = p_tenant_id
    ORDER BY r.data_recebimento DESC NULLS LAST, r.id, i.id
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, -1),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Atendimento itens (lotes + itens + desenho)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iso_pro_export_atendimentos_itens_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
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
  v_total int := -1;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF to_regclass('public.iso_pro_atendimento_lote_itens') IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'none');
  END IF;

  IF v_off = 0 THEN
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_atendimento_lote_itens i
    WHERE i.tenant_id = p_tenant_id;
  END IF;

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
      coalesce(l.snapshot_atendimento->>'recebedorColaboradorId', l.snapshot_atendimento->>'recebedor_colaborador_id', '') AS recebedor_colaborador_id,
      coalesce(l.recebedor_tipo, '') AS recebedor_tipo,
      coalesce(l.recebedor, '') AS recebedor,
      coalesce(l.snapshot_atendimento->>'recebedorEmpresa', l.snapshot_atendimento->>'recebedor_empresa', '') AS recebedor_empresa,
      coalesce(l.snapshot_atendimento->>'recebedorDocumento', l.snapshot_atendimento->>'recebedor_documento', '') AS recebedor_documento,
      coalesce(l.snapshot_atendimento->>'recebedorTelefone', l.snapshot_atendimento->>'recebedor_telefone', '') AS recebedor_telefone,
      coalesce(l.snapshot_atendimento->>'autorizadorInterno', l.snapshot_atendimento->>'autorizador_interno', '') AS autorizador_interno,
      coalesce(l.snapshot_atendimento->>'motivoRetirada', l.snapshot_atendimento->>'motivo_retirada', '') AS motivo_retirada,
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
    LEFT JOIN LATERAL (
      SELECT d.revisao, d.descricao, d.responsavel
      FROM public.iso_pro_documentos_planejamento d
      WHERE d.tenant_id = i.tenant_id
        AND (
          d.id::text = coalesce(nullif(btrim(i.documento_id), ''), nullif(btrim(l.documento_id), ''))
          OR (
            coalesce(nullif(btrim(i.documento_id), ''), nullif(btrim(l.documento_id), '')) IS NULL
            AND d.numero = coalesce(nullif(btrim(i.documento_numero), ''), nullif(btrim(l.documento_numero), ''))
          )
        )
      ORDER BY CASE
        WHEN d.id::text = coalesce(nullif(btrim(i.documento_id), ''), nullif(btrim(l.documento_id), '')) THEN 0
        ELSE 1
      END
      LIMIT 1
    ) d ON true
    WHERE i.tenant_id = p_tenant_id
    ORDER BY l.data_atendimento DESC NULLS LAST, l.id, i.id
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, -1),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RIR (header + itens do payload jsonb)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iso_pro_export_rir_itens_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
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
  v_total int := -1;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF to_regclass('public.iso_pro_rir') IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'none');
  END IF;

  IF v_off = 0 THEN
    SELECT count(*)::int INTO v_total
    FROM public.iso_pro_rir r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(coalesce(r.payload->'itensRir', '[]'::jsonb)) = 'array'
          AND jsonb_array_length(coalesce(r.payload->'itensRir', '[]'::jsonb)) > 0
        THEN r.payload->'itensRir'
        ELSE '[{}]'::jsonb
      END
    ) AS it(elem)
    WHERE r.tenant_id = p_tenant_id;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'codigo', s.codigo,
        'data_registro', s.data_registro,
        'status', s.status,
        'laudo', s.laudo,
        'fornecedor', s.fornecedor,
        'nota_fiscal', s.nota_fiscal,
        'romaneio', s.romaneio,
        'data_recebimento', s.data_recebimento,
        'procedimento', s.procedimento,
        'sol_compra', s.sol_compra,
        'uo', s.uo,
        'local_obra', s.local_obra,
        'contrato', s.contrato,
        'origem', s.origem,
        'responsavel', s.responsavel,
        'descricao', s.descricao,
        'acao_imediata', s.acao_imediata,
        'linha_item', s.linha_item,
        'codigo_material', s.codigo_material,
        'descricao_material', s.descricao_material,
        'quantidade', s.quantidade,
        'unidade', s.unidade,
        'certificado', s.certificado,
        'disciplina', s.disciplina,
        'localizacao_item', s.localizacao_item,
        'qtd_conferida', s.qtd_conferida,
        'observacoes_qc', s.observacoes_qc,
        'observacoes_tratativa', s.observacoes_tratativa,
        'obs_curta', s.obs_curta,
        'instrumentos', s.instrumentos,
        'documentos_qc', s.documentos_qc,
        'payload_storage_ref', s.payload_storage_ref
      )
      ORDER BY s.codigo, s.linha_item
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      coalesce(r.codigo, '') AS codigo,
      CASE WHEN r.data_registro IS NULL THEN NULL ELSE to_char(r.data_registro::date, 'YYYY-MM-DD') END AS data_registro,
      coalesce(r.status, '') AS status,
      coalesce(r.laudo, coalesce(r.payload->>'laudo', '')) AS laudo,
      coalesce(nullif(btrim(r.payload->>'fornecedorNome'), ''), nullif(btrim(r.payload->>'recebimentoFornecedor'), ''), '') AS fornecedor,
      coalesce(r.payload->>'recebimentoNotaFiscal', '') AS nota_fiscal,
      coalesce(r.payload->>'recebimentoRomaneio', '') AS romaneio,
      coalesce(r.payload->>'recebimentoData', '') AS data_recebimento,
      coalesce(r.payload->>'procedimentoNumero', '') AS procedimento,
      coalesce(r.payload->>'solCompraPackList', '') AS sol_compra,
      coalesce(r.payload->>'uo', '') AS uo,
      coalesce(r.payload->>'localObra', '') AS local_obra,
      coalesce(r.payload->>'contratoNumero', '') AS contrato,
      coalesce(r.payload->>'origem', '') AS origem,
      coalesce(r.responsavel, coalesce(r.payload->>'responsavel', '')) AS responsavel,
      coalesce(r.payload->>'descricao', '') AS descricao,
      coalesce(r.payload->>'acaoImediata', '') AS acao_imediata,
      it.ord::int AS linha_item,
      coalesce(it.elem->>'codigoMaterial', it.elem->>'codigo', '') AS codigo_material,
      coalesce(it.elem->>'descricaoMaterial', it.elem->>'descricao', '') AS descricao_material,
      coalesce((it.elem->>'quantidade')::numeric, 0) AS quantidade,
      coalesce(nullif(btrim(it.elem->>'unidade'), ''), 'UN') AS unidade,
      coalesce(it.elem->>'certificado', '') AS certificado,
      coalesce(it.elem->>'disciplina', r.payload->>'disciplina', '') AS disciplina,
      coalesce(it.elem->>'localizacao', '') AS localizacao_item,
      coalesce((it.elem->>'quantidadeConferida')::numeric, 0) AS qtd_conferida,
      coalesce(r.payload->>'observacoesQc', '') AS observacoes_qc,
      coalesce(r.payload->>'observacoes', '') AS observacoes_tratativa,
      coalesce(r.payload->>'obsCurta', '') AS obs_curta,
      coalesce(r.payload->>'instrumentos', '') AS instrumentos,
      coalesce(r.payload->>'documentosQc', '') AS documentos_qc,
      coalesce(r.payload->>'payloadStorageRef', '') AS payload_storage_ref
    FROM public.iso_pro_rir r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(coalesce(r.payload->'itensRir', '[]'::jsonb)) = 'array'
          AND jsonb_array_length(coalesce(r.payload->'itensRir', '[]'::jsonb)) > 0
        THEN r.payload->'itensRir'
        ELSE '[{}]'::jsonb
      END
    ) WITH ORDINALITY AS it(elem, ord)
    WHERE r.tenant_id = p_tenant_id
    ORDER BY r.codigo, it.ord
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, -1),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Materiais cadastro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iso_pro_export_materiais_page(
  p_tenant_id uuid,
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 5000
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
  v_total int := -1;
  v_rows jsonb;
BEGIN
  PERFORM public.iso_pro_assert_tenant_caller(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('_error', 'tenant_id em falta.');
  END IF;

  v_off := GREATEST(coalesce(p_offset, 0), 0);
  v_lim := LEAST(GREATEST(coalesce(p_limit, 5000), 1), 5000);

  IF to_regclass('public.materiais') IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'offset', v_off, 'limit', v_lim, '_source', 'none');
  END IF;

  IF v_off = 0 THEN
    SELECT count(*)::int INTO v_total
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'codigo', s.codigo,
        'codigo_barras', s.codigo_barras,
        'descricao', s.descricao,
        'diametro', s.diametro,
        'disciplina', s.disciplina,
        'unidade', s.unidade,
        'peso', s.peso,
        'estoque_minimo', s.estoque_minimo,
        'ativo', s.ativo
      )
      ORDER BY lower(btrim(s.codigo)), s.id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id::text AS id,
      coalesce(m.codigo, '') AS codigo,
      coalesce(m.codigo_barras, '') AS codigo_barras,
      coalesce(m.descricao, '') AS descricao,
      coalesce(m.diametro, '') AS diametro,
      coalesce(m.disciplina, '') AS disciplina,
      coalesce(nullif(btrim(m.unidade), ''), 'UN') AS unidade,
      coalesce(m.peso, 0) AS peso,
      coalesce(m.estoque_minimo, 0) AS estoque_minimo,
      coalesce(m.ativo, true) AS ativo
    FROM public.materiais m
    WHERE m.tenant_id = p_tenant_id
    ORDER BY lower(btrim(m.codigo)), m.id
    OFFSET v_off
    LIMIT v_lim
  ) AS s;

  RETURN jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, -1),
    'offset', v_off,
    'limit', v_lim,
    '_source', 'tables'
  );
END;
$$;

COMMENT ON FUNCTION public.iso_pro_export_documentos_itens_page(uuid, int, int) IS
  'Export Excel/CSV documentos: página até 5000 itens com cabeçalho do desenho.';
COMMENT ON FUNCTION public.iso_pro_export_recebimentos_itens_page(uuid, int, int) IS
  'Export Excel/CSV recebimentos: página até 5000 linhas NF+item.';
COMMENT ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int) IS
  'Export Excel/CSV atendimento: página até 5000 linhas lote+item.';
COMMENT ON FUNCTION public.iso_pro_export_rir_itens_page(uuid, int, int) IS
  'Export Excel/CSV RIR: página até 5000 linhas header+item (payload).';
COMMENT ON FUNCTION public.iso_pro_export_materiais_page(uuid, int, int) IS
  'Export Excel/CSV materiais: página até 5000 SKUs.';

REVOKE ALL ON FUNCTION public.iso_pro_export_documentos_itens_page(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_recebimentos_itens_page(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_rir_itens_page(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iso_pro_export_materiais_page(uuid, int, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.iso_pro_export_documentos_itens_page(uuid, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_recebimentos_itens_page(uuid, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_atendimentos_itens_page(uuid, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_rir_itens_page(uuid, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iso_pro_export_materiais_page(uuid, int, int) TO anon, authenticated;

COMMIT;
